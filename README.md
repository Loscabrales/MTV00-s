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

O workflow em `.github/workflows/deploy.yml` publica a cada push. Para ligar:
**Settings → Pages → Source: GitHub Actions**. O site sai em
`https://<usuário>.github.io/mtv00-s/`.

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

## Trocando o logo

`assets/logo.svg` é uma reconstrução geométrica do lockup MTV 00's, desenhada
para não depender de fontes ou imagens de terceiros. Para usar o arquivo
oficial, basta substituir esse SVG mantendo o nome — nada no código precisa
mudar.

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
