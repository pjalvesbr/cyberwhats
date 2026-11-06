# Histórico de versões

O CyberWhats usa sempre 3.2.x.y, em homenagem ao CyberScript 3.2.

## 3.2.0.5
- **Salvar como...** na janela da foto e no botão direito de qualquer mídia (foto, vídeo, áudio, arquivo): você escolhe a pasta, e o app avisa onde salvou (clique na linha para abrir a pasta). "Abrir" continua guardando em Documentos\CyberWhats\Recebidos.
- Motor atualizado para a whatsmeow mais recente (05/11): sincronização mais tolerante a erros de conferência, reconecta sozinho quando o servidor não responde, não trava ao conectar, protocolo do WhatsApp atualizado, respeita os limites do servidor na sincronização e mantém o nome mais recente dos contatos.
- **Mensagens de quando o app estava desligado** chegam em silêncio: sem balões, sons nem janelas abrindo. No fim sai um resumo só ("Enquanto você estava fora: 312 mensagens em 18 conversas"), também no Status, com duplo-clique para abrir cada conversa.
- **Balões agrupados**: no máximo 1 por conversa a cada 10 segundos ("#SNES: 6 mensagens novas") e 3 a cada 30 segundos; pvt e menção a você sempre têm balão. Dá para desligar em Opções > Windows.

## 3.2.0.4
- **Notify List** e **Ignore List** mostram todos os seus contatos com caixinha de marcar, filtro por nome ou número e "Outro número..." para quem não está na agenda.
- Corrigido: o filtro das listas com caixinhas (Notify, Ignore, Auto-Join) não escondia os itens.
- Auto-Join com caixinhas de marcar (dá para desmarcar todos), botões Marcar/Desmarcar todos e contador; texto da opção "todos os meus grupos" corrigido.
- Canais abrem sempre no fim da conversa; a linha "mensagens novas" continua marcando onde você parou.
- **Segurança e privacidade**:
  - Prévia de links recebidos só é buscada quando você clica em "▸ ver prévia do link" (buscar sozinho entregava seu IP para quem mandou o link). Prévias que já vêm na mensagem continuam aparecendo.
  - A busca de prévias só acessa endereços públicos http(s): nada de arquivos do PC, rede local ou localhost, nem nos redirecionamentos e imagens.
  - Links só abrem se forem http, https ou e-mail (protocolos do Windows como `search-ms:` e `ms-msdt:` são bloqueados).
  - A janela do app não abre mais arquivos arrastados para ela, e só a janela principal consegue usar as funções internas.
  - Arquivos recebidos: nome limpo (sem caracteres que disfarçam a extensão), sem sobrescrever outro arquivo, marcados como "baixados da internet" para o Windows avisar, e confirmação antes de abrir programas (.exe, .bat, .lnk...).
  - Arquivos internos do CyberWhats (sessão, configurações, histórico) não podem ser enviados.
  - Opção para não consultar o IP público (Opções > Geral).
- **Reagir a mensagens**: botão direito na linha > **Reagir** (👍 ❤️ 😂 😮 😢 🙏, outro emoji ou tirar a reação), ou `/reagir 👍` para a última mensagem recebida.
- Opção de abrir a **Lista de Canais** ao conectar (Opções, `/list on|off` ou botão direito na lista); ela fica fixa à esquerda, depois de Status e Contatos Recentes.
- Contador de mensagens novas da bandeja zera direito ao ler (e a bandeja ganhou **Marcar tudo como lido**).
- **Tab completa comandos**: `/not` + Tab vira `/notify`; se vários comandos começam igual, completa o que der e mostra a lista (Tab de novo alterna entre eles). Vale também para os aliases dos scripts.
- Contatos com nome "invisível" no perfil (ㅤ e outros caracteres em branco) agora aparecem com o nome da agenda, o nick do canal ou o número, em vez de um nick vazio no pvt, na switchbar e nos Contatos Recentes.

## 3.2.0.3
- **22 temas originais do CyberScript** (BitchX, Blue, Calm Blue, Dark, Focalize, Fox, Fragma, Fun-Style, GirlStyle, Hysteria, Monolith, Nature, Padrao, Popua, Rustic Ash, SbIRC, Seeper, SubSeven, Syntax, Waste, Winter, eXagon), com as cores, os formatos de mensagem, o timestamp e os schemes de cada um. Theme Manager com prévia, autor e descrição; também por `/tema`. O Padrão (do xBinho) continua sendo o tema padrão.
- Trocar de tema redesenha as conversas abertas no formato novo.
- **Ctrl+F** procura na janela (destaca todas, Enter vai para a anterior, Shift+Enter para a próxima).
- **`/buscar texto`** procura em todas as conversas (histórico e logs) e lista os resultados; duplo-clique abre a conversa já na mensagem.
- **Bandeja do Windows**: minimizar para a bandeja, opção de o X deixar rodando na bandeja, iniciar junto com o Windows e contador de mensagens novas no ícone da bandeja e da barra de tarefas (Opções > Windows).
- **Aviso de versão nova**: procura no GitHub ao abrir (e a cada 12 h) e avisa com o link para baixar; `/atualizar` procura na hora.
- **Ctrl+V com imagem** copiada envia a imagem (com legenda opcional).
- **Mensagem de voz**: botão do microfone ao lado da caixa de texto (ou `/gravar`); chega no WhatsApp como áudio gravado, com a onda.
- **Prévia de links**: título, descrição e miniatura de links do YouTube, Instagram, sites... (nos dois sentidos: quem recebe sua mensagem também vê a prévia).
- **Enquetes**: aparecem com as opções e os votos; clique para votar. `/enquete` cria uma.
- Barra de status mostra também o IP público.
- **Emojis**: Ctrl+Espaço (ou o botão 😊 ao lado da caixa de texto) abre a lista de emojis por categoria, com busca em português e os usados por último.
- **Figurinhas**: botão ao lado da caixa de texto (ou Ctrl+Shift+Espaço, `/figurinhas`) com três abas: **Favoritas** (as que você favoritou no WhatsApp do celular), **Recebidas** (as que passaram pelas suas conversas) e **Minhas** (guardadas no CyberWhats: botão direito numa figurinha do chat > Guardar em Minhas). Dá para criar figurinha a partir de uma imagem, e o Ctrl+V com imagem tem a opção **Como figurinha**.
- Contatos Recentes: botão **Remover** (ou Del / botão direito) tira o contato da lista; ele volta quando chegar mensagem nova.
- Fonte sempre nítida com a escala do Windows em 125%, 150%... (o tamanho é ajustado para a Fixedsys não ficar torta nem cortada; dá para desligar no Theme Manager).
- Trocar de tema não tira mais a rolagem do fim da conversa.

## 3.2.0.2
- Botões das janelas redesenhados, com o texto certo de cada um (Link de Convite, Informações do Grupo, Pasta de Recebidos).
- Linha **"mensagens novas"** marcando onde começam as mensagens que chegaram desde a última vez; a janela abre mostrando essa linha.
- Separador de dia nas conversas (Hoje, Ontem, data).
- Mensagens com várias linhas e linhas longas alinhadas com o começo do texto, sem repetir o horário.
- Respostas (citações) numa linha própria logo abaixo da mensagem ("└ respondendo Fulano: ..."), cortadas no fim da palavra.
- Corrigido: ao abrir um canal no meio de uma conversa, mensagens e reações apareciam acima do histórico.
- Muitas reações numa mensagem mostram os 3 emojis mais usados e o total (👏🎉❤️ 12).
- Respostas cortadas terminam com "..." (o motor agora manda o texto citado completo).
- Ícone de Enviar Arquivo sem o fundo escuro.
- MOTD: "Criado por" no lugar de "Staff".
- Reações aparecem na própria mensagem (👍2), como no WhatsApp, e ficam guardadas: aparecem mesmo que cheguem com a janela fechada ou na sincronização.
- Botão **Atualizar** em `/list`, `/contatos` e `/recentes`.
- Ícones modernos em alta resolução (nítidos em telas grandes) e botões das janelas maiores.
- Mensagens de erro do WhatsApp traduzidas (ex.: "Você não tem permissão para renomear o grupo: só os admins do grupo podem."); o detalhe técnico vai para `logs\erros.log`.
- **Tab** completa o nick como no IRC (Tab de novo alterna; no começo da frase põe "Nick: ") e o nick completado vira uma menção de verdade no WhatsApp.
- Opção de ícones **modernos** ou **clássicos** do CyberScript (Ferramentas > Temas / Cores, ou `/icones`).

## 3.2.0.1 — primeira versão pública
- Visual do CyberScript 3.2: janelas MDI, switchbar, toolbar, barra de status, tema Padrão (`>>>`), fonte Fixedsys, ícones e sons originais, MOTD estilo BRASnet.
- Grupos como `#canais` (nicklist com `@` admins e `.` dono, tópico, entrou/saiu/kick) e conversas como pvts.
- Motor whatsmeow (Go): conexão por QR code ou código numérico.
- Contatos recentes ao conectar (sempre logo depois do Status), `/contatos`, `/list`, auto-join, notify, ignore, away.
- Figurinhas, fotos, vídeos e áudios no chat.
- Copiar ao selecionar (cores invertidas), duplo-clique no nick abre pvt, duplo-clique no pvt dá whois, Tab completa nick, clicar de novo na janela ativa volta para a anterior.
- Apelidos locais (`/meunick`, `/apelido`); `/me` vai para o WhatsApp com o seu nick.
- Temas Padrão, Clássico e Dark.
- CyberWhats Script (`.cws`) com editor (Alt+R): aliases, eventos, menus, timers, variáveis. Vem com as Frases do CyberScript e o Gama Game.
- Duplo-clique num `#canal` escrito na tela entra no canal.
- Áudios no chat com botão "▶ ouvir áudio".
- Portable e instalador.
