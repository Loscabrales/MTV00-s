# MTV 00s

Um canal de televisão musical no navegador. Você abre a página, liga a TV e os
videoclipes dos anos 2000 começam a tocar sozinhos — em tela cheia, com o
grafismo do canal por cima e **sem nenhuma interface do YouTube à vista**.

Não é uma playlist: é uma grade linear. O que está no ar é calculado a partir do
relógio, então todo mundo que abrir o site no mesmo minuto vê o mesmo clipe no
mesmo segundo — e entra no meio da música, como quem liga a televisão.

## Como funciona

| Peça | Onde |
|---|---|
| Grade linear a partir do relógio | `js/schedule.js` |
| Player e supressão da UI do YouTube | `js/player.js` + `.shield` no `index.html` |
| Bug, barra NOW, bumpers, chuvisco | `js/graphics.js` + `css/graphics.css` |
| Controle remoto e guia de programação | `js/remote.js` + `css/remote.css` |
| Máquina de estados do canal | `js/main.js` |
| Acervo | `data/playlist.json` |

Sem framework e sem etapa de build — HTML, CSS e módulos ES servidos direto.

### A grade

A ordem de exibição é sorteada uma vez por dia UTC, a partir de uma semente que
todos os visitantes compartilham (`js/schedule.js`). Cada faixa ocupa um bloco
de `6s de bumper + duração do clipe`. A posição dentro do dia define qual bloco
está no ar e há quantos segundos ele começou.

Consequências: a grade muda todo dia, é idêntica para todos no mesmo dia, e
recarregar a página no meio de uma música devolve você ao mesmo ponto.

Pular um clipe ou topar com um vídeo indisponível tira você da grade
temporariamente; ao terminar o clipe atual o canal volta a se sincronizar
sozinho com o relógio.

### Anúncios e a fonte do vídeo

O site tem duas fontes, alternáveis pela tecla `S` ou por `?source=`:

**`youtube`** (padrão) — o embed oficial. Estável, com API de verdade (eventos
de fim, erro, volume, seek). **Roda anúncio quando o YouTube servir.**

**`adfree`** — a mesma origem, mas por uma instância [Invidious](https://invidious.io),
que não serve publicidade (`js/invidious.js`).

Não existe outra forma. O player oficial fica num iframe de outra origem: a
política de mesma origem impede a página de tocar em qualquer coisa lá dentro,
e não há parâmetro nem método de API que desligue anúncio. `youtube-nocookie`
não ajuda — só torna o anúncio não-personalizado.

> **O modo sem anúncio é experimental e não é confiável.** Das 11 instâncias
> públicas existentes, todas têm a API desativada e sem CORS, e só uma
> (`invidious.tiekoetter.com`) ainda serve embeds. Medindo 6 requisições
> seguidas nela, **3 falharam** com *"Companion is starting. Please wait until
> a valid potoken is found"*: o YouTube passou a exigir um proof-of-origin
> token que a instância precisa cunhar sem parar, e quando ele expira tudo cai.
>
> A falha **não é detectável pela página** — o iframe é de outra origem, então
> uma página de erro é indistinguível de uma que funciona. Não há como voltar
> automaticamente para o YouTube. Se a imagem sumir, aperte `S`.

Nesse modo também se perde o controle fino: o Invidious não tem API de
mensagens, então o fim do vídeo é cronometrado pela grade (que já é derivada do
relógio) e mudar volume recarrega o quadro na posição correta.

Quem quiser assistir sem anúncio de forma confiável: um bloqueador no navegador
(uBlock Origin) resolve por completo, no modo YouTube.

### Escondendo o YouTube

São quatro camadas, e nenhuma delas basta sozinha:

1. **Parâmetros do player** — `controls=0`, `rel=0`, `disablekb=1`,
   `iv_load_policy=3`, `playsinline=1`, `fs=0`. (`modestbranding` está
   descontinuado pelo Google; entra apenas como reforço.)
2. **`.shield`** — uma camada transparente cobre o iframe inteiro. O ponteiro
   nunca chega ao vídeo, e o título e o botão "Watch on YouTube" só aparecem no
   hover. Todo input passa pelo nosso código.
3. **Overscan** — o iframe é desenhado 6% maior que o palco e recortado, então
   qualquer sobra de interface fica fora da área visível.
4. **Nunca deixar o vídeo pausado ou terminado à mostra** — pausar levanta uma
   cartela nossa por cima, e a virada de clipe é coberta pelo bumper.

### Controles

Nada aparece na tela até você mexer o mouse, tocar ou digitar; o controle some
sozinho depois de ~3s.

| Tecla | Ação |
|---|---|
| `↑` `↓` | Volume |
| `M` | Mudo |
| `→` | Próximo clipe |
| `Espaço` | Pausa (volta ao vivo ao despausar) |
| `S` | Alterna a fonte do vídeo (YouTube ↔ sem anúncio) |
| `G` | Guia de programação |
| `F` | Tela cheia |
| `Esc` | Fecha o guia |

## Rodando localmente

```bash
python3 -m http.server 8000
# abra http://localhost:8000
```

Precisa ser servido por HTTP — abrir o `index.html` como arquivo (`file://`)
quebra os módulos ES e o player do YouTube.

## Publicando no GitHub Pages

**Passo obrigatório uma única vez:** em **Settings → Pages → Source**, escolha
**GitHub Actions**. Sem isso o deploy falha em `configure-pages` com
*"Get Pages site failed"* — o token do workflow não tem permissão para criar o
site sozinho, então esse clique não dá para automatizar.

Feito isso, `.github/workflows/deploy.yml` publica a cada push na `main`. O site
sai em `https://loscabrales.github.io/MTV00-s/`.

Todos os caminhos são relativos, então funciona em subpasta sem ajuste.

## Adicionando músicas

Edite `data/playlist.json`:

```json
{ "id": "CvBfHwUxHIk", "artist": "Rihanna", "title": "Umbrella", "year": 2007, "duration": 255 }
```

- `id` — os 11 caracteres depois de `v=` na URL do YouTube.
- `duration` — em segundos; é o que mantém a grade sincronizada. Se faltar,
  assume-se 240s e a grade fica menos precisa, mas nada quebra.

Entradas malformadas ou duplicadas são descartadas no carregamento
(`js/playlist.js`), e o workflow de deploy recusa um `playlist.json` inválido.

**Sobre disponibilidade:** o acervo foi montado com clipes de canais oficiais e
Vevo, mas o YouTube pode bloquear a incorporação de um vídeo a qualquer momento,
e isso varia por país. Quando acontece, o canal marca o clipe como morto, entra
com um bumper e segue para o próximo — o erro nunca vira tela preta.

## Grafismo

O material é o do próprio canal, usado como veio — nada foi redesenhado ou
enfeitado. A referência é a vinheta da Dido ("NOW — DIDO - THANK YOU"), e o
princípio é: se não está naquele quadro, não está aqui. Sem brilho, sem sombra
projetada, sem gradiente inventado.

### Lower third

`assets/lowerthird-now.svg` e `assets/lowerthird-next.svg` entram inteiros como
moldura. Os dois anéis, o estandarte e o rótulo NOW/NEXT já estão em contornos
dentro de cada arquivo — trocar de barra é trocar o `src` (`js/graphics.js`).

Só o nome da faixa é texto vivo, posicionado por porcentagem sobre o filete que
o próprio arquivo desenha (x 65.75→421.25, y 24.75→47.25 de uma caixa 425×53),
para que escale sem sair do lugar.

Posição e tamanho vêm de medir o quadro de referência: 63% da largura, margem
esquerda de 9%, base a 7%.

### Logo

- `assets/logo.svg` — lockup completo (M + MUSIC TELEVISION + pílula 00s), na
  tela de entrada e nos bumpers.
- `assets/bug.svg` — versão compacta (M sobre a pílula), no canto da tela e no
  cabeçalho do guia, com 12% da altura do quadro, como na cena.
- `assets/favicon.svg` — só o M.

Os três derivam do vetor oficial publicado no Wikimedia Commons
([`MTV 00s logo.svg`](https://commons.wikimedia.org/wiki/File:MTV_00s_logo.svg),
domínio público como forma simples, marca registrada da ViacomCBS Networks
EMEAA). No arquivo original o "TV" é um vazado, o que só lê como branco no
papel; sobre vídeo apareceria preto. Por isso cada peça carrega atrás uma cópia
da silhueta externa do M preenchida de branco — o vazado lê branco em qualquer
fundo, sem alterar a geometria da marca.

### Tipografia

`assets/eurostileunicaseltpro.otf`, servida localmente por `@font-face` em
`css/tokens.css`. É a fonte do canal e vale para a interface inteira.

Ela tem **um peso só**. Por isso `css/layout.css` traz
`font-synthesis-weight: none`: sem isso o navegador falsifica negrito e engorda
as letras. Os pesos declarados no CSS ficam sem efeito de propósito — presença
se dá com corpo e `letter-spacing`, não com negrito.

> **Licença:** a tabela `name` do arquivo traz *"Eurostile is a trademark of
> Linotype GmbH"* e um EULA da Linotype. É uma fonte comercial, e publicar o
> `.otf` no GitHub Pages serve o arquivo para qualquer visitante — o que uma
> licença desktop normalmente não cobre. Para trocar por uma face livre de
> recorte parecido, é só mudar o `@font-face`.

### Paleta

Tirada do próprio lower third (`css/tokens.css`): roxo da barra `#5b1bee`, rosa
do rótulo `#ef93ff`, e `#ffa0fc` do vetor do logo.

## Testes

```bash
npm i playwright                      # só na primeira vez
python3 -m http.server 8000 &         # o teste de browser precisa do servidor
node test/schedule.test.mjs           # a grade linear
node test/browser.test.mjs            # o canal inteiro, no Chromium
```

`test/browser.test.mjs` sobe o site de verdade e verifica a supressão da UI do
YouTube, a sincronia entre dois espectadores, os grafismos, o controle, o guia,
a recuperação de vídeos indisponíveis e o layout responsivo.

Ele substitui a API do YouTube por `test/yt-mock.js`, que implementa a mesma
superfície de API. Isso permite testar toda a máquina de estados — inclusive
falhas difíceis de provocar, como um vídeo com incorporação bloqueada — sem
depender da rede. **A reprodução real do vídeo pelo YouTube não é coberta por
esses testes**; para isso, abra o site em um navegador comum.
