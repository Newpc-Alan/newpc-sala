# Portal Maestro · v0.7.0 (teste de bancada)

**Portal Maestro · O professor conduz, a turma acompanha.** Sala de aula gerenciada do Portal do Educador (NEWPC).

Professor abre a aula, aluno digita o número, professor gerencia os dispositivos.

## O que esta versão faz

| Função | Onde |
|---|---|
| Gerar número da aula (6 dígitos) | Painel do professor |
| Aluno entra com número + nome | Extensão (ícone na barra do Chrome) |
| Ver quem está online, nome, e-mail da conta Google e a aba aberta | Painel |
| Enviar link para todos ou para um aluno | Painel |
| Bloquear / desbloquear todos ou um aluno | Painel |
| Encerrar aula (desbloqueia e desconecta todo mundo) | Painel |

## Passo 1 · Liberar o Firebase (obrigatório)

Banco (nome técnico mantido): projeto Firebase **newpc-sala**, instância `newpc-sala-default-rtdb` (us-central1). Se o painel mostrar "Acesso negado", confira as regras.

1. Firebase Console → projeto **newpc-sala** → Realtime Database → aba **Regras**
2. Apague o conteúdo e cole o arquivo `regras-firebase.json`
3. **Publicar**

## Passo 2 · Instalar a extensão (no PC e nos Chromebooks de teste)

1. `chrome://extensions` → ligar **Modo do desenvolvedor**
2. **Carregar sem compactação** → selecionar a pasta `extensao-aluno`
3. Se já existir a extensão antiga do POC, remova antes

## Passo 3 · Testar

1. Abra o painel: https://sala.portaldoeducador.com.br/ (ou o `index.html` local)
2. Digite seu nome → **Gerar número da aula**
3. No dispositivo do aluno: ícone da extensão → número + nome → **Entrar na aula**
4. Em até 15 s o aluno aparece no painel
5. Teste: Enviar link · Bloquear todos · Desbloquear · Encerrar

Tempo de resposta esperado: comandos em até 3 s.

## Limites conhecidos (leia antes de mostrar para cliente)

- **Segurança:** as regras atuais deixam qualquer pessoa com o endereço do banco ler e escrever nas aulas. Serve para bancada, **não para escola real** (tem nome e e-mail de aluno, LGPD). A versão de produção precisa de login do professor (Firebase Auth) e regras por escola.
- **Bloqueio:** em modo desenvolvedor o aluno consegue desativar a extensão. Na escola ela é instalada à força pelo Google Admin Console (não dá para remover nem desativar).
- **Só enxerga o Chrome:** em desktop Windows, programas fora do navegador não são controlados.
- **Hibernação:** se o Chrome adormecer a extensão, ela volta sozinha em até 30 s.

## Tela de entrada ao ligar (v0.3.0)

Ao ligar o Chromebook (ou abrir o Chrome), a extensão abre sozinha a tela **Entrar na aula** (número + nome). Depois de entrar, a tela fecha em 2,5 s.

A escola escolhe o comportamento pelo **Google Admin Console** → Dispositivos → Chrome → Apps e extensões → Usuários e navegadores → Portal Maestro → **Política para extensões**:

```json
{ "entradaObrigatoria": { "Value": true } }
```

| Política | Comportamento |
|---|---|
| sem política / `false` | A tela abre ao ligar, mas o aluno pode fechar (padrão, bom para teste) |
| `true` | Tela em modo travado: o aluno só usa o Chrome depois de entrar numa aula; ao encerrar a aula, a tela volta |

## Fase 1 · recursos de aula (v0.5.0)

| Recurso | No painel | No Chromebook do aluno |
|---|---|---|
| **Acervo na batuta** | Botão Acervo: catálogo do Portal 360, jogos, Portal do Aluno e ferramentas, com busca, categorias e "Meus links" (salvos no navegador do professor). Envia para a turma toda ou um aluno | Conteúdo abre sozinho em nova aba |
| **Afinação** | Botão Afinação: pergunta + termômetro (entendeu / mais ou menos / não entendeu / sem resposta) e etiqueta no card de cada aluno | Janelinha do Maestro com três botões; só o professor vê as respostas |
| **Compasso** | Botão Compasso: atividade + tempo (1 a 20 min), contagem no painel, botão Parar | Janelinha com cronômetro grande, contagem também no ícone da extensão; aviso sonoro no fim |

A janelinha do Maestro é uma janela própria da extensão: **nenhuma permissão nova** foi adicionada. Durante o bloqueio ela some; ao desbloquear, volta.

Dados novos no banco: `aulas/{codigo}/controle/afinacao`, `aulas/{codigo}/controle/compasso`, `aulas/{codigo}/respostas/afinacao/{idPergunta}/{idAluno}` (já cobertos pelas regras atuais).

## Trava de segurança (v0.5.1)

O bloqueio de tela só vale enquanto o painel do professor está vivo. O painel envia um sinal (`controle/professorVivo`) a cada 15 s; se a extensão ficar **mais de 2 minutos sem esse sinal** (aba fechada, sem internet, notebook desligado), ela **libera a tela sozinha**. O painel também avisa antes de fechar quando há alunos bloqueados.

Emergência sem painel: encerrar ou apagar a aula no Firebase (`aulas/{codigo}`) libera todos em até 3 s.
- **v0.5.2:** o bloqueio nunca sobrevive a um reinício do Chrome (só volta se o painel confirmar em até 3 s), e a extensão nunca fecha a última aba de uma janela. Corrige o caso em que o Chrome abria e fechava sozinho.
- **Saída de emergência no Windows:** fechar o Chrome, `Windows+R` → `chrome --disable-extensions`, abrir o perfil e remover a extensão em `chrome://extensions`.

## v0.6.0 · Tela de bloqueio motivacional e Pergunta individual

**Tela de bloqueio:** mensagens motivacionais em tela cheia (arte do Portal do Educador), sorteadas a cada bloqueio e trocadas a cada 40 s sem repetir a anterior, com o nome do aluno no canto. Para incluir mensagens: salvar o JPG (16:9, ~1600 px) em `extensao-aluno/bloqueio/` e acrescentar o nome na lista `MENSAGENS` de `bloqueio.js`. Os textos ficam centralizados porque a imagem é recortada nas laterais em telas mais estreitas.

**Pergunta individual:** botão **Perguntar** no card de cada aluno. Resposta livre (até 500 caracteres) ou de 2 a 4 alternativas. Só aquele aluno vê a pergunta (janelinha do Maestro, com aviso sonoro curto) e só o professor vê a resposta, que aparece no próprio card. **Concluir** limpa o card; a resposta fica guardada em `aulas/{codigo}/respostas/perguntas/` para o relatório futuro.

## v0.7.0 · Painel da aula, mão levantada e linguagem do professor

- **Botões em três grupos:** Conduzir a aula (Conteúdos, Enviar link) · Ouvir a turma (Pesquisa rápida, Cronômetro) · Telas dos alunos (Bloquear, Liberar). Nomes em linguagem de professor; "Afinação" virou **Pesquisa rápida** e "Compasso" virou **Cronômetro** em todas as telas.
- **Painel da aula:** tempo de aula, conectados, mãos levantadas, interações dos alunos e telas bloqueadas.
- **Mão levantada:** o aluno clica no ícone da extensão → **Levantar a mão**. No painel: aviso no topo com a mão acenando, tremidinha na tela, som curto e card do aluno piscando. **Atender** baixa a mão no Chromebook do aluno.
- **Linha do tempo:** cada ação do professor e cada resposta/mão do aluno vira um item com horário (`aulas/{codigo}/log`), base do relatório da aula.
- Painel só redesenha o que mudou (sem piscar e sem botão "fugindo" do clique).
