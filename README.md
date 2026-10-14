# NEWPC Sala · v0.2.1 (teste de bancada)

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

Banco: projeto Firebase **newpc-sala**, instância `newpc-sala-default-rtdb` (us-central1). Se o painel mostrar "Acesso negado", confira as regras.

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
