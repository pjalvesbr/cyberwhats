// cw-engine: motor do CyberWhats baseado na whatsmeow (protocolo multi-device do WhatsApp).
// Conversa com o app (Electron) por JSON, uma mensagem por linha, em stdin/stdout:
//
//	pedido:   {"id":1,"cmd":"send","args":{...}}
//	resposta: {"id":1,"ok":true,"data":...}   ou   {"id":1,"ok":false,"error":"..."}
//	evento:   {"event":"message","data":{...}}
package main

import (
	"bufio"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"go.mau.fi/whatsmeow/util/cbcutil"
	"go.mau.fi/whatsmeow/util/hkdfutil"
	"io"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	_ "github.com/ncruces/go-sqlite3/driver"

	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/appstate"
	"go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/store"
	"go.mau.fi/whatsmeow/store/sqlstore"
	"go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"
	waLog "go.mau.fi/whatsmeow/util/log"
	"google.golang.org/protobuf/proto"
)

var (
	outMu     sync.Mutex
	stdout    = bufio.NewWriter(os.Stdout)
	cli       *whatsmeow.Client
	container *sqlstore.Container
	dataDir   string
	logFile   *os.File
	groups    = map[types.JID]*types.GroupInfo{}
	groupsMu  sync.RWMutex
	chatsMu   sync.Mutex
	chats     = map[string]map[string]any{} // conversas conhecidas (histórico)
	ctx       = context.Background()
	pairPhone string
)

// ---------------------------------------------------------------- saída
func write(v any) {
	b, err := json.Marshal(v)
	if err != nil {
		logf("json: %v", err)
		return
	}
	outMu.Lock()
	stdout.Write(b)
	stdout.WriteByte('\n')
	stdout.Flush()
	outMu.Unlock()
}
func emit(ev string, data any) { write(map[string]any{"event": ev, "data": data}) }
func logf(f string, a ...any) {
	if logFile != nil {
		fmt.Fprintf(logFile, "%s %s\n", time.Now().Format("2006-01-02 15:04:05"), fmt.Sprintf(f, a...))
	}
}

// logger da whatsmeow -> arquivo
type fileLog struct{ mod string }

func (l fileLog) Errorf(m string, a ...any) { logf("[%s ERRO] "+m, append([]any{l.mod}, a...)...) }
func (l fileLog) Warnf(m string, a ...any)  { logf("[%s AVISO] "+m, append([]any{l.mod}, a...)...) }
func (l fileLog) Infof(m string, a ...any)  { logf("[%s] "+m, append([]any{l.mod}, a...)...) }
func (l fileLog) Debugf(m string, a ...any) {}
func (l fileLog) Sub(m string) waLog.Logger { return fileLog{l.mod + "/" + m} }

// ---------------------------------------------------------------- nomes e ids
func pn(j types.JID) types.JID {
	j = j.ToNonAD()
	if j.Server == types.HiddenUserServer && cli != nil {
		if p, err := cli.Store.LIDs.GetPNForLID(ctx, j); err == nil && !p.IsEmpty() {
			return p.ToNonAD()
		}
	}
	return j
}
func meJID() types.JID {
	if cli == nil || cli.Store.ID == nil {
		return types.EmptyJID
	}
	return cli.Store.ID.ToNonAD()
}
func isMe(j types.JID) bool {
	if cli == nil || cli.Store.ID == nil {
		return false
	}
	j = j.ToNonAD()
	return j.User == cli.Store.ID.User || (!cli.Store.LID.IsEmpty() && j.User == cli.Store.LID.User)
}
func nameOf(j types.JID, push string) string {
	if j.IsEmpty() {
		return "?"
	}
	if isMe(j) {
		if cli.Store.PushName != "" {
			return cli.Store.PushName
		}
		return j.User
	}
	p := pn(j)
	if cli != nil {
		for _, k := range []types.JID{p, j.ToNonAD()} {
			if c, err := cli.Store.Contacts.GetContact(ctx, k); err == nil && c.Found {
				if c.FullName != "" {
					return c.FullName
				}
				if push != "" {
					return push
				}
				if c.PushName != "" {
					return c.PushName
				}
				if c.BusinessName != "" {
					return c.BusinessName
				}
				if c.FirstName != "" {
					return c.FirstName
				}
			}
		}
	}
	if push != "" {
		return push
	}
	if p.Server == types.HiddenUserServer {
		u := p.User
		if len(u) > 6 {
			u = u[len(u)-6:]
		}
		return "lid" + u
	}
	return "+" + p.User
}
func chatName(j types.JID) string {
	if j.Server == types.GroupServer {
		groupsMu.RLock()
		g := groups[j]
		groupsMu.RUnlock()
		if g != nil && g.Name != "" {
			return g.Name
		}
		chatsMu.Lock()
		defer chatsMu.Unlock()
		if c, ok := chats[j.String()]; ok {
			if n, _ := c["name"].(string); n != "" {
				return n
			}
		}
		return j.User
	}
	return nameOf(j, "")
}
func parseJID(s string) (types.JID, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return types.EmptyJID, errors.New("jid vazio")
	}
	if !strings.Contains(s, "@") {
		s = strings.TrimPrefix(s, "+") + "@s.whatsapp.net"
	}
	return types.ParseJID(s)
}

// ---------------------------------------------------------------- mensagens
var mediaNames = map[string]string{"image": "Imagem", "video": "Vídeo", "audio": "Áudio", "document": "Arquivo", "sticker": "Figurinha"}

func ctxInfo(m *waE2E.Message) *waE2E.ContextInfo {
	switch {
	case m.GetExtendedTextMessage() != nil:
		return m.GetExtendedTextMessage().GetContextInfo()
	case m.GetImageMessage() != nil:
		return m.GetImageMessage().GetContextInfo()
	case m.GetVideoMessage() != nil:
		return m.GetVideoMessage().GetContextInfo()
	case m.GetAudioMessage() != nil:
		return m.GetAudioMessage().GetContextInfo()
	case m.GetDocumentMessage() != nil:
		return m.GetDocumentMessage().GetContextInfo()
	case m.GetStickerMessage() != nil:
		return m.GetStickerMessage().GetContextInfo()
	}
	return nil
}
func textOf(m *waE2E.Message) string {
	if m == nil {
		return ""
	}
	if t := m.GetConversation(); t != "" {
		return t
	}
	if t := m.GetExtendedTextMessage().GetText(); t != "" {
		return t
	}
	if t := m.GetImageMessage().GetCaption(); t != "" {
		return t
	}
	if t := m.GetVideoMessage().GetCaption(); t != "" {
		return t
	}
	if t := m.GetDocumentMessage().GetCaption(); t != "" {
		return t
	}
	return ""
}

// chave da conversa: grupos como estão; pvts sempre pelo número (nunca @lid)
func chatKey(info types.MessageInfo) types.JID {
	c := info.Chat.ToNonAD()
	if c.Server == types.GroupServer || c.Server == types.BroadcastServer || c.Server == types.NewsletterServer {
		return c
	}
	if c.Server == types.HiddenUserServer {
		if info.IsFromMe && !info.RecipientAlt.IsEmpty() && info.RecipientAlt.Server == types.DefaultUserServer {
			return info.RecipientAlt.ToNonAD()
		}
		if !info.IsFromMe && !info.SenderAlt.IsEmpty() && info.SenderAlt.Server == types.DefaultUserServer {
			return info.SenderAlt.ToNonAD()
		}
		return pn(c)
	}
	return c
}

func entryOf(evt *events.Message, live bool) map[string]any {
	info := evt.Info
	m := evt.Message
	if m == nil {
		return nil
	}
	chat := chatKey(info)
	if chat.Server == types.BroadcastServer || chat.Server == types.NewsletterServer {
		return nil
	}
	sender := info.Sender.ToNonAD()
	if !info.SenderAlt.IsEmpty() && sender.Server == types.HiddenUserServer && info.SenderAlt.Server == types.DefaultUserServer {
		sender = info.SenderAlt.ToNonAD()
	}
	sender = pn(sender)
	if info.IsFromMe {
		sender = meJID()
	}
	e := map[string]any{
		"id": info.ID, "chat": chat.String(), "ts": info.Timestamp.Unix(), "fromMe": info.IsFromMe,
		"sender": sender.String(), "senderRaw": info.Sender.ToNonAD().String(),
		"nick": nameOf(sender, pushIf(!info.IsFromMe, info.PushName)), "group": chat.Server == types.GroupServer,
		"chatName": chatName(chat), "kind": "text", "text": "",
	}
	if !info.Chat.IsEmpty() && info.Chat.ToNonAD() != chat {
		e["alt"] = info.Chat.ToNonAD().String()
	}
	// protocolo: apagar / editar
	if pm := m.GetProtocolMessage(); pm != nil {
		switch pm.GetType() {
		case waE2E.ProtocolMessage_REVOKE:
			if live {
				emit("revoke", map[string]any{"chat": chat.String(), "id": pm.GetKey().GetID(), "nick": e["nick"]})
			}
		}
		return nil
	}
	if evt.IsEdit {
		orig := ""
		if raw := evt.RawMessage; raw != nil {
			if k := raw.GetEditedMessage().GetMessage().GetProtocolMessage().GetKey(); k != nil {
				orig = k.GetID()
			} else if k := raw.GetProtocolMessage().GetKey(); k != nil {
				orig = k.GetID()
			}
		}
		if live {
			emit("edit", map[string]any{"chat": chat.String(), "id": orig, "text": textOf(m), "fromMe": info.IsFromMe, "nick": e["nick"]})
		}
		return nil
	}
	if r := m.GetReactionMessage(); r != nil {
		// reações também vêm na sincronização do histórico: a ponte guarda e só mostra as ao vivo
		emit("reaction", map[string]any{"chat": chat.String(), "emoji": r.GetText(), "nick": e["nick"], "sender": e["sender"], "fromMe": info.IsFromMe, "targetId": r.GetKey().GetID(), "live": live})
		return nil
	}
	// voto em enquete: decifra e manda só quais opções (hash sha256 do nome) a pessoa marcou
	if pu := m.GetPollUpdateMessage(); pu != nil {
		if vote, err := cli.DecryptPollVote(ctx, evt); err == nil {
			hs := []string{}
			for _, h := range vote.GetSelectedOptions() {
				hs = append(hs, hex.EncodeToString(h))
			}
			emit("poll-vote", map[string]any{"chat": chat.String(), "pollId": pu.GetPollCreationMessageKey().GetID(), "nick": e["nick"], "sender": e["sender"], "fromMe": info.IsFromMe, "hashes": hs, "ts": info.Timestamp.Unix(), "live": live})
		}
		return nil
	}
	switch {
	case m.GetConversation() != "" || m.GetExtendedTextMessage() != nil:
		e["text"] = textOf(m)
		if xt := m.GetExtendedTextMessage(); xt != nil && (xt.GetTitle() != "" || xt.GetDescription() != "") {
			lk := map[string]any{"url": xt.GetMatchedText(), "title": xt.GetTitle(), "desc": xt.GetDescription()}
			if t := xt.GetJPEGThumbnail(); len(t) > 0 && len(t) < 100*1024 {
				lk["thumb"] = "data:image/jpeg;base64," + base64.StdEncoding.EncodeToString(t)
			}
			e["link"] = lk
		}
	case m.GetImageMessage() != nil:
		im := m.GetImageMessage()
		media(e, "image", im.GetCaption(), "", im.GetFileLength(), 0, false)
		thumb(e, im.GetJPEGThumbnail(), "image/jpeg")
		e["mimetype"], e["w"], e["h"] = im.GetMimetype(), im.GetWidth(), im.GetHeight()
	case m.GetVideoMessage() != nil:
		v := m.GetVideoMessage()
		media(e, "video", v.GetCaption(), "", v.GetFileLength(), v.GetSeconds(), false)
		thumb(e, v.GetJPEGThumbnail(), "image/jpeg")
		e["mimetype"], e["gif"] = v.GetMimetype(), v.GetGifPlayback()
	case m.GetAudioMessage() != nil:
		a := m.GetAudioMessage()
		media(e, "audio", "", "", a.GetFileLength(), a.GetSeconds(), a.GetPTT())
		e["mimetype"] = a.GetMimetype()
	case m.GetDocumentMessage() != nil:
		d := m.GetDocumentMessage()
		media(e, "document", d.GetCaption(), d.GetFileName(), d.GetFileLength(), 0, false)
	case m.GetStickerMessage() != nil:
		st := m.GetStickerMessage()
		media(e, "sticker", "", "", st.GetFileLength(), 0, false)
		thumb(e, st.GetPngThumbnail(), "image/png")
		e["mimetype"], e["animated"] = st.GetMimetype(), st.GetIsAnimated()
	case m.GetLocationMessage() != nil:
		l := m.GetLocationMessage()
		e["kind"], e["media"] = "media", "Localização"
		e["caption"] = strings.TrimSpace(fmt.Sprintf("%s https://maps.google.com/?q=%f,%f", l.GetName(), l.GetDegreesLatitude(), l.GetDegreesLongitude()))
	case m.GetLiveLocationMessage() != nil:
		l := m.GetLiveLocationMessage()
		e["kind"], e["media"] = "media", "Localização ao vivo"
		e["caption"] = fmt.Sprintf("https://maps.google.com/?q=%f,%f", l.GetDegreesLatitude(), l.GetDegreesLongitude())
	case m.GetContactMessage() != nil:
		e["kind"], e["media"], e["caption"] = "media", "Contato", m.GetContactMessage().GetDisplayName()
	case m.GetContactsArrayMessage() != nil:
		e["kind"], e["media"], e["caption"] = "media", "Contatos", m.GetContactsArrayMessage().GetDisplayName()
	case m.GetPollCreationMessage() != nil || m.GetPollCreationMessageV3() != nil || m.GetPollCreationMessageV2() != nil:
		p := m.GetPollCreationMessage()
		if p == nil {
			p = m.GetPollCreationMessageV3()
		}
		if p == nil {
			p = m.GetPollCreationMessageV2()
		}
		opts := []string{}
		for _, o := range p.GetOptions() {
			opts = append(opts, o.GetOptionName())
		}
		e["kind"], e["text"] = "poll", p.GetName()
		e["poll"] = map[string]any{"name": p.GetName(), "options": opts, "max": p.GetSelectableOptionsCount()}
	case m.GetEventMessage() != nil:
		e["kind"], e["media"], e["caption"] = "media", "Evento", m.GetEventMessage().GetName()
	case m.GetButtonsResponseMessage() != nil:
		e["text"] = m.GetButtonsResponseMessage().GetSelectedDisplayText()
	case m.GetListResponseMessage() != nil:
		e["text"] = m.GetListResponseMessage().GetTitle()
	default:
		return nil
	}
	if ci := ctxInfo(m); ci != nil {
		if q := ci.GetQuotedMessage(); q != nil {
			qt := textOf(q)
			if qt == "" {
				qt = "[mensagem]"
				switch {
				case q.GetImageMessage() != nil:
					qt = "[Imagem]"
				case q.GetVideoMessage() != nil:
					qt = "[Vídeo]"
				case q.GetAudioMessage() != nil:
					qt = "[Áudio]"
				case q.GetStickerMessage() != nil:
					qt = "[Figurinha]"
				case q.GetDocumentMessage() != nil:
					qt = "[Arquivo]"
				}
			}
			if len([]rune(qt)) > 300 {
				qt = string([]rune(qt)[:300])
			}
			qp, _ := types.ParseJID(ci.GetParticipant())
			e["quote"] = map[string]any{"nick": nameOf(qp, ""), "text": qt, "id": ci.GetStanzaID()}
		}
		if mj := ci.GetMentionedJID(); len(mj) > 0 {
			ms := []map[string]any{}
			for _, s := range mj {
				j, err := types.ParseJID(s)
				if err != nil {
					continue
				}
				ms = append(ms, map[string]any{"num": j.User, "nick": nameOf(j, ""), "me": isMe(j)})
			}
			e["mentions"] = ms
		}
		if ci.GetIsForwarded() {
			e["forwarded"] = true
		}
	}
	if t, _ := e["text"].(string); e["kind"] == "text" && strings.HasPrefix(t, "* ") && len(t) > 2 {
		e["kind"], e["text"] = "action", t[2:]
	}
	if raw, err := proto.Marshal(m); err == nil {
		e["raw"] = base64.StdEncoding.EncodeToString(raw)
	}
	return e
}
func pushIf(c bool, s string) string {
	if c {
		return s
	}
	return ""
}
func thumb(e map[string]any, b []byte, mt string) {
	if len(b) > 0 && len(b) < 150*1024 {
		e["thumb"] = "data:" + mt + ";base64," + base64.StdEncoding.EncodeToString(b)
	}
}
func media(e map[string]any, kind, caption, file string, size uint64, secs uint32, ptt bool) {
	e["kind"], e["media"], e["caption"], e["fileName"] = "media", mediaNames[kind], caption, file
	e["size"], e["seconds"], e["ptt"], e["hasMedia"] = size, secs, ptt, true
}

// ---------------------------------------------------------------- grupos
func groupOut(g *types.GroupInfo) map[string]any {
	parts := []map[string]any{}
	for _, p := range g.Participants {
		id := p.JID
		if !p.PhoneNumber.IsEmpty() {
			id = p.PhoneNumber
		}
		id = pn(id)
		adm := any(nil)
		if p.IsSuperAdmin {
			adm = "superadmin"
		} else if p.IsAdmin {
			adm = "admin"
		}
		nick := nameOf(id, "")
		if p.DisplayName != "" && strings.HasPrefix(nick, "lid") {
			nick = p.DisplayName
		}
		parts = append(parts, map[string]any{"id": id.String(), "nick": nick, "admin": adm, "me": isMe(p.JID) || isMe(id)})
	}
	owner := ""
	if !g.OwnerPN.IsEmpty() {
		owner = g.OwnerPN.String()
	} else if !g.OwnerJID.IsEmpty() {
		owner = pn(g.OwnerJID).String()
	}
	return map[string]any{
		"id": g.JID.String(), "subject": g.Name, "desc": g.Topic, "descId": g.TopicID, "owner": owner,
		"creation": g.GroupCreated.Unix(), "announce": g.IsAnnounce, "restrict": g.IsLocked, "participants": parts,
	}
}
func setGroup(g *types.GroupInfo) {
	groupsMu.Lock()
	groups[g.JID] = g
	groupsMu.Unlock()
}
func refreshGroups() {
	gs, err := cli.GetJoinedGroups(ctx)
	if err != nil {
		emit("error", map[string]any{"text": "Erro ao listar grupos: " + err.Error()})
		return
	}
	for _, g := range gs {
		setGroup(g)
	}
	emit("chats", listChats())
}
func listChats() []map[string]any {
	out := []map[string]any{}
	seen := map[string]bool{}
	groupsMu.RLock()
	for _, g := range groups {
		id := g.JID.String()
		seen[id] = true
		var ts any = int64(0)
		chatsMu.Lock()
		if c, ok := chats[id]; ok {
			ts = c["ts"]
		}
		chatsMu.Unlock()
		out = append(out, map[string]any{"id": id, "name": g.Name, "group": true, "size": len(g.Participants), "topic": g.Topic, "ts": ts})
	}
	groupsMu.RUnlock()
	chatsMu.Lock()
	for id, c := range chats {
		if seen[id] {
			continue
		}
		cc := map[string]any{"id": id}
		for k, v := range c {
			cc[k] = v
		}
		out = append(out, cc)
	}
	chatsMu.Unlock()
	return out
}
func touchChat(id, name string, group bool, ts int64, unread int) {
	chatsMu.Lock()
	defer chatsMu.Unlock()
	c, ok := chats[id]
	if !ok {
		c = map[string]any{"group": group, "ts": int64(0), "unread": 0}
		chats[id] = c
	}
	if name != "" {
		c["name"] = name
	}
	if old, _ := c["ts"].(int64); ts > old {
		c["ts"] = ts
	}
	if unread >= 0 {
		c["unread"] = unread
	}
}

// ---------------------------------------------------------------- eventos da whatsmeow
func onEvent(raw any) {
	switch evt := raw.(type) {
	case *events.Connected:
		me := meJID()
		emit("state", map[string]any{"state": "online", "me": map[string]any{"id": me.String(), "name": nameOf(me, "")}})
		go func() {
			cli.SendPresence(ctx, types.PresenceAvailable)
			refreshGroups()
		}()
	case *events.Disconnected:
		emit("state", map[string]any{"state": "connecting", "reason": "conexão caiu, reconectando..."})
	case *events.KeepAliveTimeout:
		emit("info", map[string]any{"text": fmt.Sprintf("Conexão instável (keepalive %d)...", evt.ErrorCount)})
	case *events.KeepAliveRestored:
		emit("info", map[string]any{"text": "Conexão restabelecida."})
	case *events.LoggedOut:
		emit("loggedOut", map[string]any{"reason": evt.Reason.String()})
		emit("state", map[string]any{"state": "offline", "reason": "Sessão encerrada no celular"})
	case *events.StreamReplaced:
		emit("state", map[string]any{"state": "offline", "reason": "Esta sessão foi aberta em outro lugar"})
	case *events.TemporaryBan:
		emit("error", map[string]any{"text": evt.String()})
	case *events.ConnectFailure:
		emit("error", map[string]any{"text": "Falha ao conectar: " + evt.Reason.String() + " " + evt.Message})
	case *events.ClientOutdated:
		emit("error", map[string]any{"text": "O WhatsApp diz que esta versão está desatualizada — é preciso atualizar o CyberWhats."})
	case *events.PairSuccess:
		emit("info", map[string]any{"text": "Celular pareado! Conectando..."})
	case *events.Message:
		e := entryOf(evt, true)
		if e == nil {
			return
		}
		grp, _ := e["group"].(bool)
		nm := ""
		if grp {
			nm, _ = e["chatName"].(string)
		}
		touchChat(e["chat"].(string), nm, grp, evt.Info.Timestamp.Unix(), -1)
		emit("message", e)
	case *events.HistorySync:
		go onHistory(evt)
	case *events.ChatPresence:
		chat := chatKey(types.MessageInfo{MessageSource: evt.MessageSource})
		who := pn(evt.Sender)
		st := "paused"
		if evt.State == types.ChatPresenceComposing {
			st = "composing"
			if evt.Media == types.ChatPresenceMediaAudio {
				st = "recording"
			}
		}
		emit("presence", map[string]any{"chat": chat.String(), "who": who.String(), "nick": nameOf(who, ""), "presence": st})
	case *events.Presence:
		who := pn(evt.From)
		st := "available"
		if evt.Unavailable {
			st = "unavailable"
		}
		emit("presence", map[string]any{"chat": who.String(), "who": who.String(), "nick": nameOf(who, ""), "presence": st})
	case *events.GroupInfo:
		go onGroupInfo(evt)
	case *events.JoinedGroup:
		setGroup(&evt.GroupInfo)
		emit("chats", listChats())
	case *events.PushName:
		// nomes atualizados: nada a fazer, a store da whatsmeow guarda
	case *events.AppState:
		// figurinhas favoritas do WhatsApp (sincronizadas entre os aparelhos)
		if len(evt.Index) > 0 && evt.Index[0] == "favoriteSticker" && evt.SyncActionValue != nil && evt.GetStickerAction() != nil {
			sa := evt.GetStickerAction()
			key := ""
			if len(evt.Index) > 1 {
				key = evt.Index[1]
			}
			st := &waE2E.StickerMessage{URL: sa.URL, DirectPath: sa.DirectPath, MediaKey: sa.MediaKey, FileEncSHA256: sa.FileEncSHA256, Mimetype: sa.Mimetype, Height: sa.Height, Width: sa.Width, FileLength: sa.FileLength, IsAnimated: sa.IsLottie}
			raw, _ := proto.Marshal(&waE2E.Message{StickerMessage: st})
			emit("sticker-fav", map[string]any{"key": key, "fav": sa.GetIsFavorite(), "raw": base64.StdEncoding.EncodeToString(raw), "w": sa.GetWidth(), "h": sa.GetHeight(), "ts": evt.GetTimestamp(), "hash": sa.GetImageHash(), "hasKey": len(sa.GetMediaKey()) > 0 && (sa.GetDirectPath() != "" || sa.GetURL() != "")})
		}
	case *events.CallOffer:
		from := pn(evt.From)
		emit("call", map[string]any{"from": from.String(), "nick": nameOf(from, ""), "video": false})
	case *events.OfflineSyncCompleted:
		emit("info", map[string]any{"text": fmt.Sprintf("Mensagens recebidas enquanto offline: %d", evt.Count)})
	}
}

func onGroupInfo(evt *events.GroupInfo) {
	old := map[string]any{}
	groupsMu.RLock()
	if g := groups[evt.JID]; g != nil {
		old["subject"] = g.Name
	}
	groupsMu.RUnlock()
	var gout map[string]any
	if g, err := cli.GetGroupInfo(ctx, evt.JID); err == nil {
		setGroup(g)
		gout = groupOut(g)
	}
	by, byID := "", ""
	if evt.SenderPN != nil {
		by, byID = nameOf(*evt.SenderPN, ""), evt.SenderPN.ToNonAD().String()
	} else if evt.Sender != nil {
		s := pn(*evt.Sender)
		by, byID = nameOf(s, ""), s.String()
	}
	tg := func(js []types.JID) []map[string]any {
		out := []map[string]any{}
		for _, j := range js {
			p := pn(j)
			out = append(out, map[string]any{"id": p.String(), "nick": nameOf(p, "")})
		}
		return out
	}
	base := func(kind string) map[string]any {
		return map[string]any{"chat": evt.JID.String(), "kind": kind, "nick": by, "authorId": byID, "group": gout}
	}
	sent := false
	if len(evt.Join) > 0 {
		e := base("add")
		e["targets"] = tg(evt.Join)
		emit("group-event", e)
		sent = true
	}
	if len(evt.Leave) > 0 {
		e := base("remove")
		e["targets"] = tg(evt.Leave)
		emit("group-event", e)
		sent = true
	}
	if len(evt.Promote) > 0 {
		e := base("promote")
		e["targets"] = tg(evt.Promote)
		emit("group-event", e)
		sent = true
	}
	if len(evt.Demote) > 0 {
		e := base("demote")
		e["targets"] = tg(evt.Demote)
		emit("group-event", e)
		sent = true
	}
	if evt.Name != nil {
		e := base("subject")
		e["from"], e["text"] = old["subject"], evt.Name.Name
		emit("group-event", e)
		sent = true
	}
	if evt.Topic != nil {
		e := base("topic")
		e["text"] = evt.Topic.Topic
		emit("group-event", e)
		sent = true
	}
	if !sent && gout != nil {
		emit("group", gout)
	}
}

func onHistory(evt *events.HistorySync) {
	d := evt.Data
	batch := []map[string]any{}
	for _, conv := range d.GetConversations() {
		cj, err := types.ParseJID(conv.GetID())
		if err != nil {
			continue
		}
		key := cj
		if cj.Server == types.HiddenUserServer {
			if p := conv.GetPnJID(); p != "" {
				if pj, err := types.ParseJID(p); err == nil {
					key = pj.ToNonAD()
				}
			} else {
				key = pn(cj)
			}
		}
		if key.Server == types.BroadcastServer || key.Server == types.NewsletterServer {
			continue
		}
		name := conv.GetName()
		if name == "" {
			name = conv.GetDisplayName()
		}
		ts := int64(conv.GetConversationTimestamp())
		if lt := int64(conv.GetLastMsgTimestamp()); lt > ts {
			ts = lt
		}
		touchChat(key.String(), name, key.Server == types.GroupServer, ts, int(conv.GetUnreadCount()))
		for _, hm := range conv.GetMessages() {
			wm := hm.GetMessage()
			if wm == nil {
				continue
			}
			pe, err := cli.ParseWebMessage(cj, wm)
			if err != nil {
				continue
			}
			if e := entryOf(pe, false); e != nil {
				e["chat"] = key.String()
				batch = append(batch, e)
			}
			if len(batch) >= 300 {
				emit("history", map[string]any{"messages": batch})
				batch = []map[string]any{}
			}
		}
	}
	if len(batch) > 0 {
		emit("history", map[string]any{"messages": batch})
	}
	emit("chats", listChats())
	if p := d.GetProgress(); p > 0 {
		emit("sync", map[string]any{"progress": p})
	}
}

// ---------------------------------------------------------------- comandos
type req struct {
	ID   int             `json:"id"`
	Cmd  string          `json:"cmd"`
	Args json.RawMessage `json:"args"`
}

func str(a map[string]any, k string) string { s, _ := a[k].(string); return s }

func handle(r req) (any, error) {
	a := map[string]any{}
	if len(r.Args) > 0 {
		json.Unmarshal(r.Args, &a)
	}
	switch r.Cmd {
	case "connect":
		return nil, connect(str(a, "dataDir"), str(a, "pairPhone"))
	case "disconnect":
		if cli != nil {
			cli.Disconnect()
		}
		emit("state", map[string]any{"state": "offline", "reason": "Desconectado pelo usuário"})
		return nil, nil
	case "logout":
		if cli == nil {
			return nil, errors.New("não conectado")
		}
		err := cli.Logout(ctx)
		emit("state", map[string]any{"state": "offline", "reason": "Sessão encerrada"})
		return nil, err
	case "hasSession":
		return hasSession(str(a, "dataDir")), nil
	}
	if cli == nil || !cli.IsConnected() {
		return nil, errors.New("não conectado")
	}
	switch r.Cmd {
	case "chats":
		return listChats(), nil
	case "group":
		j, err := parseJID(str(a, "jid"))
		if err != nil {
			return nil, err
		}
		g, err := cli.GetGroupInfo(ctx, j)
		if err != nil {
			return nil, err
		}
		setGroup(g)
		return groupOut(g), nil
	case "send":
		return send(a)
	case "sendFile":
		return sendFile(a)
	case "favStickers":
		// busca de novo (sincronização completa) as listas onde o WhatsApp guarda as favoritas
		cli.EmitAppStateEventsOnFullSync = true
		defer func() { cli.EmitAppStateEventsOnFullSync = false }()
		var last error
		for _, n := range []appstate.WAPatchName{appstate.WAPatchRegularLow, appstate.WAPatchRegular, appstate.WAPatchRegularHigh} {
			if err := cli.FetchAppState(ctx, n, true, false); err != nil {
				last = err
			}
		}
		return nil, last
	case "stickerShas":
		// hash (sha256) de figurinhas do histórico, para achar as favoritas antigas que vêm sem chave
		out := map[string]string{}
		if arr, ok := a["items"].([]any); ok {
			for _, it := range arr {
				mm, _ := it.(map[string]any)
				b, err := base64.StdEncoding.DecodeString(str(mm, "raw"))
				if err != nil {
					continue
				}
				msg := &waE2E.Message{}
				if proto.Unmarshal(b, msg) != nil {
					continue
				}
				if h := msg.GetStickerMessage().GetFileSHA256(); len(h) > 0 {
					out[str(mm, "id")] = base64.StdEncoding.EncodeToString(h)
				}
			}
		}
		return out, nil
	case "sendSticker":
		to, err := parseJID(str(a, "jid"))
		if err != nil {
			return nil, err
		}
		data, err := os.ReadFile(str(a, "path"))
		if err != nil {
			return nil, err
		}
		if len(data) > 1024*1024 {
			return nil, errors.New("figurinha maior que 1 MB")
		}
		u, err := cli.Upload(ctx, data, whatsmeow.MediaImage)
		if err != nil {
			return nil, err
		}
		mt := "image/webp"
		w, h := uint32(512), uint32(512)
		if v, ok := a["w"].(float64); ok && v > 0 {
			w = uint32(v)
		}
		if v, ok := a["h"].(float64); ok && v > 0 {
			h = uint32(v)
		}
		anim, _ := a["animated"].(bool)
		st := &waE2E.StickerMessage{URL: &u.URL, DirectPath: &u.DirectPath, MediaKey: u.MediaKey, FileEncSHA256: u.FileEncSHA256, FileSHA256: u.FileSHA256, FileLength: &u.FileLength, Mimetype: &mt, Width: &w, Height: &h, IsAnimated: &anim}
		m := &waE2E.Message{StickerMessage: st}
		resp, err := cli.SendMessage(ctx, to, m)
		if err != nil {
			return nil, err
		}
		return sentEntry(to, resp.ID, resp.Timestamp, m), nil
	case "pollVote":
		chat, err := parseJID(str(a, "chat"))
		if err != nil {
			return nil, err
		}
		sender, _ := types.ParseJID(str(a, "sender"))
		fm, _ := a["fromMe"].(bool)
		if fm || sender.IsEmpty() {
			sender = cli.Store.GetJID().ToNonAD()
			if s2, _ := types.ParseJID(str(a, "sender")); !s2.IsEmpty() {
				sender = s2
			}
		}
		opts := []string{}
		if arr, ok := a["options"].([]any); ok {
			for _, v := range arr {
				if s, ok := v.(string); ok {
					opts = append(opts, s)
				}
			}
		}
		info := &types.MessageInfo{MessageSource: types.MessageSource{Chat: chat, Sender: sender, IsFromMe: fm, IsGroup: chat.Server == types.GroupServer}, ID: str(a, "id")}
		msg, err := cli.BuildPollVote(ctx, info, opts)
		if err != nil {
			return nil, err
		}
		_, err = cli.SendMessage(ctx, chat, msg)
		return nil, err
	case "sendPoll":
		to, err := parseJID(str(a, "jid"))
		if err != nil {
			return nil, err
		}
		opts := []string{}
		if arr, ok := a["options"].([]any); ok {
			for _, v := range arr {
				if s, ok := v.(string); ok && strings.TrimSpace(s) != "" {
					opts = append(opts, strings.TrimSpace(s))
				}
			}
		}
		if len(opts) < 2 {
			return nil, errors.New("a enquete precisa de pelo menos 2 opções")
		}
		max := 1
		if v, ok := a["multi"].(bool); ok && v {
			max = 0
		}
		m := cli.BuildPollCreation(str(a, "name"), opts, max)
		resp, err := cli.SendMessage(ctx, to, m)
		if err != nil {
			return nil, err
		}
		return sentEntry(to, resp.ID, resp.Timestamp, m), nil
	case "download":
		return download(a)
	case "read":
		j, err := parseJID(str(a, "jid"))
		if err != nil {
			return nil, err
		}
		ids := []types.MessageID{}
		for _, v := range a["ids"].([]any) {
			ids = append(ids, v.(string))
		}
		var sender types.JID
		if s := str(a, "sender"); s != "" {
			sender, _ = types.ParseJID(s)
		}
		if len(ids) == 0 {
			return nil, nil
		}
		return nil, cli.MarkRead(ctx, ids, time.Now(), j, sender)
	case "presence":
		if str(a, "type") == "unavailable" {
			return nil, cli.SendPresence(ctx, types.PresenceUnavailable)
		}
		return nil, cli.SendPresence(ctx, types.PresenceAvailable)
	case "chatstate":
		j, err := parseJID(str(a, "jid"))
		if err != nil {
			return nil, err
		}
		st := types.ChatPresencePaused
		if str(a, "state") == "composing" {
			st = types.ChatPresenceComposing
		}
		return nil, cli.SendChatPresence(ctx, j, st, types.ChatPresenceMediaText)
	case "subscribe":
		j, err := parseJID(str(a, "jid"))
		if err != nil {
			return nil, err
		}
		if j.Server != types.DefaultUserServer {
			return nil, nil
		}
		return nil, cli.SubscribePresence(ctx, j)
	case "whois":
		return whois(str(a, "jid"))
	case "pic":
		j, err := parseJID(str(a, "jid"))
		if err != nil {
			return nil, err
		}
		p, err := cli.GetProfilePictureInfo(ctx, j, &whatsmeow.GetProfilePictureParams{})
		if err != nil || p == nil {
			return nil, nil
		}
		return p.URL, nil
	case "exists":
		n := regexp.MustCompile(`\D`).ReplaceAllString(str(a, "number"), "")
		res, err := cli.IsOnWhatsApp(ctx, []string{"+" + n})
		if err != nil {
			return nil, err
		}
		for _, x := range res {
			if x.IsIn {
				return x.JID.ToNonAD().String(), nil
			}
		}
		return nil, nil
	case "contacts":
		all, err := cli.Store.Contacts.GetAllContacts(ctx)
		if err != nil {
			return nil, err
		}
		out := []map[string]any{}
		seen := map[string]bool{}
		for j, c := range all {
			id := pn(j)
			if id.Server != types.DefaultUserServer || isMe(id) || seen[id.String()] {
				continue
			}
			nick := c.FullName
			if nick == "" {
				nick = c.PushName
			}
			if nick == "" {
				nick = c.BusinessName
			}
			if nick == "" {
				continue
			}
			seen[id.String()] = true
			var ts any = int64(0)
			chatsMu.Lock()
			if ch, ok := chats[id.String()]; ok {
				ts = ch["ts"]
			}
			chatsMu.Unlock()
			out = append(out, map[string]any{"id": id.String(), "nick": nick, "name": c.FullName, "push": c.PushName, "my": c.FullName != "", "ts": ts})
		}
		return out, nil
	case "groupAction":
		j, err := parseJID(str(a, "jid"))
		if err != nil {
			return nil, err
		}
		ids := []types.JID{}
		for _, v := range a["ids"].([]any) {
			if x, err := parseJID(v.(string)); err == nil {
				ids = append(ids, x)
			}
		}
		act := map[string]whatsmeow.ParticipantChange{"add": whatsmeow.ParticipantChangeAdd, "remove": whatsmeow.ParticipantChangeRemove, "promote": whatsmeow.ParticipantChangePromote, "demote": whatsmeow.ParticipantChangeDemote}[str(a, "action")]
		res, err := cli.UpdateGroupParticipants(ctx, j, ids, act)
		if err != nil {
			return nil, err
		}
		out := []map[string]any{}
		for _, p := range res {
			st := "200"
			if p.Error != 0 {
				st = fmt.Sprint(p.Error)
			}
			out = append(out, map[string]any{"jid": pn(p.JID).String(), "status": st})
		}
		return out, nil
	case "subject":
		j, err := parseJID(str(a, "jid"))
		if err != nil {
			return nil, err
		}
		return true, cli.SetGroupName(ctx, j, str(a, "text"))
	case "desc":
		j, err := parseJID(str(a, "jid"))
		if err != nil {
			return nil, err
		}
		prev := ""
		groupsMu.RLock()
		if g := groups[j]; g != nil {
			prev = g.TopicID
		}
		groupsMu.RUnlock()
		return true, cli.SetGroupTopic(ctx, j, prev, "", str(a, "text"))
	case "leave":
		j, err := parseJID(str(a, "jid"))
		if err != nil {
			return nil, err
		}
		return true, cli.LeaveGroup(ctx, j)
	case "invite":
		j, err := parseJID(str(a, "jid"))
		if err != nil {
			return nil, err
		}
		return cli.GetGroupInviteLink(ctx, j, false)
	case "setStatus":
		t := str(a, "text")
		return true, cli.SetStatusMessage(ctx, types.SetStatusInput{Text: &t})
	case "setName":
		n := str(a, "text")
		if err := cli.SendAppState(ctx, appstate.BuildSettingPushName(n)); err != nil {
			return nil, err
		}
		cli.Store.PushName = n
		return true, nil
	}
	return nil, fmt.Errorf("comando desconhecido: %s", r.Cmd)
}

func hasSession(dir string) bool {
	_, err := os.Stat(filepath.Join(dir, "whatsmeow.db"))
	return err == nil
}

func openStore(dir string) error {
	if container != nil {
		return nil
	}
	dataDir = dir
	os.MkdirAll(filepath.Join(dir, "logs"), 0o755)
	if f, err := os.OpenFile(filepath.Join(dir, "logs", "whatsmeow.log"), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644); err == nil {
		logFile = f
	}
	store.DeviceProps.Os = proto.String("CyberWhats")
	dsn := "file:" + filepath.ToSlash(filepath.Join(dir, "whatsmeow.db")) + "?_pragma=foreign_keys(1)&_pragma=busy_timeout(10000)&_pragma=journal_mode(WAL)"
	c, err := sqlstore.New(ctx, "sqlite3", dsn, fileLog{"db"})
	if err != nil {
		return err
	}
	container = c
	return nil
}

func connect(dir, phone string) error {
	if err := openStore(dir); err != nil {
		return fmt.Errorf("erro ao abrir a sessão: %w", err)
	}
	if cli != nil && cli.IsConnected() {
		return nil
	}
	dev, err := container.GetFirstDevice(ctx)
	if err != nil {
		return err
	}
	if cli == nil {
		cli = whatsmeow.NewClient(dev, fileLog{"wa"})
		cli.EnableAutoReconnect = true
		cli.AutoTrustIdentity = true
		cli.AddEventHandler(onEvent)
	}
	emit("state", map[string]any{"state": "connecting"})
	if cli.Store.ID == nil {
		qr, err := cli.GetQRChannel(context.Background())
		if err != nil {
			return err
		}
		if err := cli.Connect(); err != nil {
			return err
		}
		if phone != "" {
			code, err := cli.PairPhone(ctx, regexp.MustCompile(`\D`).ReplaceAllString(phone, ""), true, whatsmeow.PairClientChrome, "Chrome (CyberWhats)")
			if err != nil {
				emit("error", map[string]any{"text": "Falha no código de pareamento: " + err.Error()})
			} else {
				emit("pairing", map[string]any{"code": code})
			}
		}
		go func() {
			for item := range qr {
				switch item.Event {
				case "code":
					if phone == "" {
						emit("qr", map[string]any{"code": item.Code})
					}
				case "timeout":
					emit("error", map[string]any{"text": "O QR code expirou. Use /server para tentar de novo."})
					emit("state", map[string]any{"state": "offline", "reason": "QR expirado"})
				case "success":
				default:
					if item.Error != nil {
						emit("error", map[string]any{"text": "Erro no pareamento: " + item.Error.Error()})
					}
				}
			}
		}()
		return nil
	}
	return cli.Connect()
}

// ---------------------------------------------------------------- envio
func quoteCtx(a map[string]any) *waE2E.ContextInfo {
	ci := &waE2E.ContextInfo{}
	used := false
	if qid := str(a, "quoteId"); qid != "" {
		ci.StanzaID = proto.String(qid)
		if p := str(a, "quoteSender"); p != "" {
			ci.Participant = proto.String(p)
		}
		if raw := str(a, "quoteRaw"); raw != "" {
			if b, err := base64.StdEncoding.DecodeString(raw); err == nil {
				q := &waE2E.Message{}
				if proto.Unmarshal(b, q) == nil {
					ci.QuotedMessage = q
				}
			}
		}
		used = true
	}
	if ms, ok := a["mentions"].([]any); ok && len(ms) > 0 {
		for _, m := range ms {
			ci.MentionedJID = append(ci.MentionedJID, m.(string))
		}
		used = true
	}
	if !used {
		return nil
	}
	return ci
}

func sentEntry(to types.JID, id string, ts time.Time, m *waE2E.Message) map[string]any {
	info := types.MessageInfo{MessageSource: types.MessageSource{Chat: to, Sender: meJID(), IsFromMe: true, IsGroup: to.Server == types.GroupServer}, ID: id, Timestamp: ts}
	return entryOf(&events.Message{Info: info, Message: m}, false)
}

func send(a map[string]any) (any, error) {
	to, err := parseJID(str(a, "jid"))
	if err != nil {
		return nil, err
	}
	text := str(a, "text")
	var m *waE2E.Message
	lk, _ := a["link"].(map[string]any)
	if ci := quoteCtx(a); ci != nil || lk != nil {
		xt := &waE2E.ExtendedTextMessage{Text: proto.String(text), ContextInfo: ci}
		if lk != nil {
			// prévia do link (título/descrição), igual o WhatsApp faz
			xt.MatchedText = strp(str(lk, "url"))
			xt.Title = strp(str(lk, "title"))
			xt.Description = strp(str(lk, "desc"))
			xt.PreviewType = waE2E.ExtendedTextMessage_NONE.Enum()
			if t := str(lk, "thumb"); t != "" {
				if b, err := base64.StdEncoding.DecodeString(t); err == nil && len(b) < 100*1024 {
					xt.JPEGThumbnail = b
				}
			}
		}
		m = &waE2E.Message{ExtendedTextMessage: xt}
	} else {
		m = &waE2E.Message{Conversation: proto.String(text)}
	}
	resp, err := cli.SendMessage(ctx, to, m)
	if err != nil {
		return nil, err
	}
	touchChat(to.String(), "", to.Server == types.GroupServer, resp.Timestamp.Unix(), -1)
	return sentEntry(to, resp.ID, resp.Timestamp, m), nil
}

func sendFile(a map[string]any) (any, error) {
	to, err := parseJID(str(a, "jid"))
	if err != nil {
		return nil, err
	}
	path := str(a, "path")
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	if len(data) > 100*1024*1024 {
		return nil, errors.New("arquivo maior que 100 MB")
	}
	ext := strings.ToLower(filepath.Ext(path))
	mt := mime.TypeByExtension(ext)
	if mt == "" {
		mt = http.DetectContentType(data)
	}
	mt = strings.Split(mt, ";")[0]
	caption := str(a, "caption")
	name := filepath.Base(path)
	var m *waE2E.Message
	up := func(t whatsmeow.MediaType) (whatsmeow.UploadResponse, error) { return cli.Upload(ctx, data, t) }
	switch {
	case strings.HasPrefix(mt, "image/") && mt != "image/gif" && mt != "image/webp":
		u, err := up(whatsmeow.MediaImage)
		if err != nil {
			return nil, err
		}
		m = &waE2E.Message{ImageMessage: &waE2E.ImageMessage{URL: &u.URL, DirectPath: &u.DirectPath, MediaKey: u.MediaKey, Mimetype: &mt, FileEncSHA256: u.FileEncSHA256, FileSHA256: u.FileSHA256, FileLength: &u.FileLength, Caption: strp(caption)}}
	case mt == "video/mp4" || mt == "video/3gpp":
		u, err := up(whatsmeow.MediaVideo)
		if err != nil {
			return nil, err
		}
		m = &waE2E.Message{VideoMessage: &waE2E.VideoMessage{URL: &u.URL, DirectPath: &u.DirectPath, MediaKey: u.MediaKey, Mimetype: &mt, FileEncSHA256: u.FileEncSHA256, FileSHA256: u.FileSHA256, FileLength: &u.FileLength, Caption: strp(caption)}}
	case mt == "audio/ogg" || mt == "audio/mpeg" || mt == "audio/mp4" || ext == ".opus":
		u, err := up(whatsmeow.MediaAudio)
		if err != nil {
			return nil, err
		}
		if ext == ".opus" || mt == "audio/ogg" {
			mt = "audio/ogg; codecs=opus"
		}
		am := &waE2E.AudioMessage{URL: &u.URL, DirectPath: &u.DirectPath, MediaKey: u.MediaKey, Mimetype: &mt, FileEncSHA256: u.FileEncSHA256, FileSHA256: u.FileSHA256, FileLength: &u.FileLength}
		// mensagem de voz gravada no CyberWhats (aparece com o microfone no WhatsApp)
		if p, _ := a["ptt"].(bool); p && strings.HasPrefix(mt, "audio/ogg") {
			am.PTT = proto.Bool(true)
			if sec, ok := a["seconds"].(float64); ok && sec > 0 {
				am.Seconds = proto.Uint32(uint32(sec + 0.5))
			}
			if wf, ok := a["waveform"].(string); ok && wf != "" {
				if b, err := base64.StdEncoding.DecodeString(wf); err == nil {
					am.Waveform = b
				}
			}
		}
		m = &waE2E.Message{AudioMessage: am}
	default:
		u, err := up(whatsmeow.MediaDocument)
		if err != nil {
			return nil, err
		}
		if mt == "" {
			mt = "application/octet-stream"
		}
		m = &waE2E.Message{DocumentMessage: &waE2E.DocumentMessage{URL: &u.URL, DirectPath: &u.DirectPath, MediaKey: u.MediaKey, Mimetype: &mt, FileEncSHA256: u.FileEncSHA256, FileSHA256: u.FileSHA256, FileLength: &u.FileLength, FileName: &name, Title: &name, Caption: strp(caption)}}
	}
	resp, err := cli.SendMessage(ctx, to, m)
	if err != nil {
		return nil, err
	}
	return sentEntry(to, resp.ID, resp.Timestamp, m), nil
}
func strp(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func download(a map[string]any) (any, error) {
	b, err := base64.StdEncoding.DecodeString(str(a, "raw"))
	if err != nil {
		return nil, errors.New("mídia não disponível")
	}
	m := &waE2E.Message{}
	if err := proto.Unmarshal(b, m); err != nil {
		return nil, err
	}
	var data []byte
	if st := m.GetStickerMessage(); st != nil && len(st.GetFileSHA256()) != 32 {
		// figurinha favorita (vem da sincronização sem o hash do arquivo): baixa e decifra direto
		data, err = downloadNoHash(st.GetURL(), st.GetDirectPath(), st.GetMediaKey(), "WhatsApp Image Keys")
	} else {
		data, err = cli.DownloadAny(ctx, m)
	}
	if err != nil {
		return nil, err
	}
	mt, name := "", ""
	switch {
	case m.GetImageMessage() != nil:
		mt = m.GetImageMessage().GetMimetype()
	case m.GetVideoMessage() != nil:
		mt = m.GetVideoMessage().GetMimetype()
	case m.GetAudioMessage() != nil:
		mt = m.GetAudioMessage().GetMimetype()
	case m.GetDocumentMessage() != nil:
		mt, name = m.GetDocumentMessage().GetMimetype(), m.GetDocumentMessage().GetFileName()
	case m.GetStickerMessage() != nil:
		mt = m.GetStickerMessage().GetMimetype()
	}
	return map[string]any{"data": base64.StdEncoding.EncodeToString(data), "mimetype": mt, "filename": name}, nil
}

func downloadNoHash(url, directPath string, mediaKey []byte, info string) ([]byte, error) {
	if len(mediaKey) == 0 {
		return nil, errors.New("essa figurinha favorita só existe no celular")
	}
	urls := []string{}
	if url != "" {
		urls = append(urls, url)
	}
	if directPath != "" {
		urls = append(urls, "https://mmg.whatsapp.net"+directPath)
	}
	var body []byte
	var last error = errors.New("figurinha sem endereço")
	for _, u := range urls {
		req, _ := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
		req.Header.Set("Origin", "https://web.whatsapp.com")
		req.Header.Set("Referer", "https://web.whatsapp.com/")
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			last = err
			continue
		}
		b, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
		resp.Body.Close()
		if err != nil || resp.StatusCode != 200 {
			if resp.StatusCode == 403 || resp.StatusCode == 404 || resp.StatusCode == 410 {
				last = errors.New("essa figurinha expirou no servidor do WhatsApp")
			} else {
				last = fmt.Errorf("não consegui baixar a figurinha (status %d)", resp.StatusCode)
			}
			continue
		}
		body, last = b, nil
		break
	}
	if last != nil {
		return nil, last
	}
	if len(body) <= 10 {
		return nil, errors.New("figurinha vazia")
	}
	keys := hkdfutil.SHA256(mediaKey, nil, []byte(info), 112)
	iv, cipherKey, macKey := keys[:16], keys[16:48], keys[48:80]
	ct, mac := body[:len(body)-10], body[len(body)-10:]
	hm := hmac.New(sha256.New, macKey)
	hm.Write(iv)
	hm.Write(ct)
	if !hmac.Equal(hm.Sum(nil)[:10], mac) {
		return nil, errors.New("figurinha corrompida")
	}
	return cbcutil.Decrypt(cipherKey, iv, ct)
}

func whois(js string) (any, error) {
	j, err := parseJID(js)
	if err != nil {
		return nil, err
	}
	j = pn(j)
	out := map[string]any{"id": j.String(), "nick": nameOf(j, ""), "groups": []string{}}
	if c, err := cli.Store.Contacts.GetContact(ctx, j); err == nil {
		out["name"], out["notify"], out["verified"] = c.FullName, c.PushName, c.BusinessName
	}
	if info, err := cli.GetUserInfo(ctx, []types.JID{j}); err == nil {
		if u, ok := info[j]; ok {
			out["status"] = u.Status
			if u.VerifiedName != nil && u.VerifiedName.Details != nil {
				out["verified"] = u.VerifiedName.Details.GetVerifiedName()
			}
		}
	}
	if p, err := cli.GetProfilePictureInfo(ctx, j, &whatsmeow.GetProfilePictureParams{}); err == nil && p != nil {
		out["pic"] = p.URL
	}
	gl := []string{}
	groupsMu.RLock()
	for _, g := range groups {
		for _, p := range g.Participants {
			id := p.JID
			if !p.PhoneNumber.IsEmpty() {
				id = p.PhoneNumber
			}
			if pn(id).User == j.User {
				pre := ""
				if p.IsAdmin || p.IsSuperAdmin {
					pre = "@"
				}
				gl = append(gl, pre+g.Name)
			}
		}
	}
	groupsMu.RUnlock()
	sort.Strings(gl)
	out["groups"] = gl
	return out, nil
}

// ---------------------------------------------------------------- main
func main() {
	in := bufio.NewReaderSize(os.Stdin, 1<<20)
	for {
		line, err := in.ReadBytes('\n')
		if len(line) > 0 {
			var r req
			if json.Unmarshal(line, &r) == nil {
				go func(r req) {
					defer func() {
						if p := recover(); p != nil {
							logf("pânico em %s: %v", r.Cmd, p)
							write(map[string]any{"id": r.ID, "ok": false, "error": fmt.Sprint("erro interno: ", p)})
						}
					}()
					data, err := handle(r)
					if err != nil {
						write(map[string]any{"id": r.ID, "ok": false, "error": err.Error()})
					} else {
						write(map[string]any{"id": r.ID, "ok": true, "data": data})
					}
				}(r)
			}
		}
		if err == io.EOF {
			break
		}
		if err != nil {
			break
		}
	}
	if cli != nil {
		cli.Disconnect()
	}
}
