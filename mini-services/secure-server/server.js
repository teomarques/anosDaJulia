/**
 * Mini-servidor Express.js seguro para alojamento no Render.
 * 
 * Implementa filtragem de IP real (com suporte a trust-proxy para o Render)
 * e um mecanismo de backup (bypass) via Cookie ativado por parâmetro de URL (?vip=julia2026).
 */

const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuração das Regras de Acesso
const AUTHORIZED_IP = '95.94.55.106';
const BYPASS_TOKEN = 'julia2026';
const COOKIE_NAME = 'secure_access';
const COOKIE_VALUE = 'granted';

// Ativar a confiança no proxy (X-Forwarded-For). 
// Essencial no Render para que o req.ip mostre o IP real do cliente e não o do balanceador de carga.
app.set('trust proxy', true);

// Middleware para ler cookies de forma segura
app.use(cookieParser());

// Middleware de Segurança e Controlo de Acesso
app.use((req, res, next) => {
  // 1. Capturar o IP real. Express com 'trust proxy' coloca o IP do cliente em req.ip.
  // Como redundância de segurança, lemos também diretamente do cabeçalho x-forwarded-for.
  const clientIp = req.ip || (req.headers['x-forwarded-for'] 
    ? req.headers['x-forwarded-for'].split(',')[0].trim() 
    : req.socket.remoteAddress);

  // 2. Verificar se o URL tem o token de bypass (?vip=julia2026)
  if (req.query.vip === BYPASS_TOKEN) {
    // Injetar o Cookie de acesso persistente
    res.cookie(COOKIE_NAME, COOKIE_VALUE, {
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 dias de persistência
      httpOnly: true,                  // Protege contra ataques XSS (não acessível via JS do browser)
      secure: req.secure || process.env.NODE_ENV === 'production', // Apenas HTTPS em produção (Render)
      sameSite: 'lax'                  // Proteção básica contra CSRF
    });

    console.log(`[Segurança] Token VIP válido detetado de ${clientIp}. Cookie injetado. Redirecionando...`);
    
    // Redireciona para remover o token da barra de endereços do browser do utilizador (limpeza de URL)
    return res.redirect(req.path);
  }

  // 3. Verificar o Cookie de acesso
  const hasAccessCookie = req.cookies[COOKIE_NAME] === COOKIE_VALUE;

  // 4. Aplicar a lógica de permissão
  const isAuthorizedIp = clientIp === AUTHORIZED_IP;

  if (isAuthorizedIp || hasAccessCookie) {
    // Acesso permitido
    console.log(`[Acesso Permitido] IP: ${clientIp} | Cookie: ${hasAccessCookie ? 'Sim' : 'Não'}`);
    return next();
  }

  // 5. Bloqueio Padrão - Acesso negado
  console.warn(`[Acesso Rejeitado] Tentativa bloqueada de IP: ${clientIp} | Pedido: ${req.method} ${req.url}`);
  res.status(403).send('Acesso Restrito');
});

// Servir a pasta de ficheiros estáticos "public"
app.use(express.static(path.join(__dirname, 'public')));

// Fallback para SPA ou se não encontrar o ficheiro estático
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Iniciar o servidor
app.listen(PORT, () => {
  console.log(`=================================================`);
  console.log(` Servidor seguro a correr na porta ${PORT}`);
  console.log(` IP Autorizado: ${AUTHORIZED_IP}`);
  console.log(` Token de Acesso: ?vip=${BYPASS_TOKEN}`);
  console.log(` Modo: ${process.env.NODE_ENV || 'development'}`);
  console.log(`=================================================`);
});
