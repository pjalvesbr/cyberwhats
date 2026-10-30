# Histórico de versões

O CyberWhats usa sempre 3.2.x.y, em homenagem ao CyberScript 3.2.

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
