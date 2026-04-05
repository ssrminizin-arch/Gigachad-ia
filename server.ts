import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";
import admin from "firebase-admin";
import fs from "fs";
import nodemailer from "nodemailer";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin
const firebaseConfigPath = path.join(__dirname, "firebase-applet-config.json");
const firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, "utf-8"));

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: firebaseConfig.projectId,
  });
}
const firestore = admin.firestore();
if (firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)') {
  // @ts-ignore - databaseId is available in newer versions of firebase-admin
  firestore.settings({ databaseId: firebaseConfig.firestoreDatabaseId });
}

// Initialize Database
const isVercel = process.env.VERCEL === "1";
const dbPath = isVercel ? "/tmp/logs.db" : "logs.db";
const db = new Database(dbPath);
db.exec(`
  CREATE TABLE IF NOT EXISTS access_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    user_agent TEXT
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS blacklist (
    ip TEXT PRIMARY KEY,
    reason TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Migration: Add city and region columns if they don't exist
try {
  db.exec("ALTER TABLE access_logs ADD COLUMN city TEXT");
  db.exec("ALTER TABLE access_logs ADD COLUMN region TEXT");
} catch (e) {
  // Columns likely already exist
}

// Geolocation Cache
const geoCache = new Map<string, { city: string, region: string }>();

// Email Transporter (Lazy Initialization)
let transporter: any = null;

function getTransporter() {
  if (!transporter) {
    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
    if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
      console.warn("[EMAIL] SMTP configuration missing. Email sending disabled.");
      return null;
    }
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: parseInt(SMTP_PORT || "587"),
      secure: parseInt(SMTP_PORT || "587") === 465,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS.replace(/\s+/g, ""),
      },
    });
  }
  return transporter;
}

async function sendAccessCodeEmail(to: string, code: string) {
  const t = getTransporter();
  if (!t) return;

  const mailOptions = {
    from: process.env.SMTP_FROM || `"GigaChad IA" <${process.env.SMTP_USER}>`,
    to,
    subject: "Seu Acesso ao GigaChad IA Chegou! 🗿",
    html: `
      <div style="background-color: #09090b; color: #f4f4f5; font-family: sans-serif; padding: 40px; max-width: 600px; margin: 0 auto; border-radius: 24px; border: 1px solid #27272a;">
        <div style="text-align: center; margin-bottom: 30px;">
          <div style="font-size: 48px; margin-bottom: 10px;">🗿</div>
          <h1 style="color: #ffffff; font-size: 24px; font-weight: 800; text-transform: uppercase; letter-spacing: 2px; font-style: italic; margin: 0;">GigaChad IA</h1>
          <p style="color: #71717a; font-size: 10px; text-transform: uppercase; letter-spacing: 4px; margin-top: 5px;">Onde os fracos não têm vez</p>
        </div>

        <div style="background-color: #18181b; padding: 30px; border-radius: 16px; border: 1px solid #3f3f46; text-align: center;">
          <p style="color: #a1a1aa; font-size: 16px; margin-bottom: 20px;">Seu pagamento foi confirmado. Aqui está sua chave de acesso de 30 dias:</p>
          
          <div style="background-color: #000000; color: #10b981; font-family: monospace; font-size: 32px; font-weight: bold; padding: 20px; border-radius: 12px; border: 1px solid #10b981; margin-bottom: 20px; letter-spacing: 4px;">
            ${code}
          </div>

          <p style="color: #ef4444; font-size: 14px; font-weight: bold; margin-bottom: 20px;">
            ⚠️ IMPORTANTE: Use este código com a conta do e-mail que você realizou a compra (${to}).
          </p>

          <a href="https://gigachad-ia-tot8.vercel.app" style="display: inline-block; background-color: #10b981; color: #000000; text-decoration: none; font-weight: 800; padding: 16px 32px; border-radius: 12px; text-transform: uppercase; letter-spacing: 1px;">
            Acessar GigaChad IA
          </a>
        </div>

        <div style="margin-top: 30px; text-align: center; color: #52525b; font-size: 12px;">
          <p>Se tiver qualquer dúvida, responda a este e-mail.</p>
          <p style="margin-top: 10px;">© 2026 GigaChad IA. Todos os direitos reservados.</p>
        </div>
      </div>
    `,
  };

  try {
    await t.sendMail(mailOptions);
    console.log(`[EMAIL] Código enviado com sucesso para ${to}`);
  } catch (err) {
    console.error(`[EMAIL] Erro ao enviar e-mail para ${to}:`, err);
  }
}

async function getGeoLocation(ip: string) {
  // Clean IP (remove IPv6 prefix if present)
  const cleanIp = ip.replace(/^::ffff:/, "");

  // Check cache first
  if (geoCache.has(cleanIp)) {
    return geoCache.get(cleanIp)!;
  }

  // Handle local IPs
  if (
    cleanIp === "::1" || 
    cleanIp === "127.0.0.1" || 
    cleanIp.startsWith("192.168.") || 
    cleanIp.startsWith("10.") ||
    cleanIp.startsWith("172.16.") ||
    cleanIp === "localhost"
  ) {
    const local = { city: "Localhost", region: "Rede Local" };
    geoCache.set(cleanIp, local);
    return local;
  }

  try {
    const response = await fetch(`http://ip-api.com/json/${cleanIp}`);
    if (response.ok) {
      const data = await response.json();
      if (data.status === "success") {
        const geo = {
          city: data.city || "Unknown",
          region: data.regionName || "Unknown"
        };
        geoCache.set(cleanIp, geo);
        return geo;
      }
    }
  } catch (err) {
    console.error(`Failed to fetch geolocation for ${cleanIp}:`, err);
  }
  return { city: "Desconhecido", region: "Desconhecido" };
}

// Backfill function to resolve missing locations in existing logs
async function backfillLogs() {
  try {
    const missingLogs = db.prepare("SELECT id, ip FROM access_logs WHERE city IS NULL OR city = 'Unknown' OR city = 'Desconhecido' LIMIT 50").all() as {id: number, ip: string}[];
    
    for (const log of missingLogs) {
      const geo = await getGeoLocation(log.ip);
      if (geo.city !== "Desconhecido") {
        db.prepare("UPDATE access_logs SET city = ?, region = ? WHERE id = ?").run(geo.city, geo.region, log.id);
      }
      // Small delay to avoid rate limiting ip-api.com
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  } catch (err) {
    console.error("Backfill failed:", err);
  }
}

const app = express();
const PORT = 3000;

async function startServer() {
  // Run backfill on startup
  backfillLogs();

  // Trust proxy to get real IP behind nginx
  app.set('trust proxy', true);

  // Middleware for JSON parsing
  app.use(express.json());

  // IP Logging & Blacklist Check Middleware
  app.use(async (req, res, next) => {
    let ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    
    // Handle x-forwarded-for list
    if (Array.isArray(ip)) ip = ip[0];
    if (typeof ip === 'string' && ip.includes(',')) {
      ip = ip.split(',')[0].trim();
    }
    const cleanIp = (ip as string || "").replace(/^::ffff:/, "");

    // Check Blacklist
    const blacklisted = db.prepare("SELECT reason FROM blacklist WHERE ip = ?").get(cleanIp) as { reason: string } | undefined;
    
    if (blacklisted && !req.path.startsWith('/api/admin')) {
      return res.status(403).send(`
        <div style="background: #09090b; color: #71717a; font-family: sans-serif; height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 20px;">
          <h1 style="color: #f4f4f5; font-size: 2rem; margin-bottom: 10px;">VOCÊ FOI BLACKLISTADO DO GIGACHAD IA</h1>
          <p style="margin-bottom: 20px;">Motivo: <span style="color: #ef4444;">${blacklisted.reason}</span></p>
          <div style="border-top: 1px solid #27272a; padding-top: 20px;">
            <p>Achou injusto? Entre em contato:</p>
            <p style="color: #10b981; font-weight: bold; font-size: 1.2rem;">82996109343</p>
          </div>
          <div style="margin-top: 40px; font-size: 3rem;">🗿</div>
        </div>
      `);
    }

    // Log almost everything except static assets to capture all accesses
    const isAsset = req.path.match(/\.(png|jpg|jpeg|gif|svg|css|js|ico|woff|woff2|ttf|eot)$/i);
    const isInternal = req.path.startsWith('/@vite') || req.path.startsWith('/node_modules');

    if (!isAsset && !isInternal) {
      const userAgent = req.headers['user-agent'];
      
      // Don't block the request for geolocation
      getGeoLocation(cleanIp).then(geo => {
        try {
          const stmt = db.prepare("INSERT INTO access_logs (ip, city, region, user_agent) VALUES (?, ?, ?, ?)");
          stmt.run(cleanIp, geo.city, geo.region, userAgent || "Unknown");
        } catch (err) {
          console.error("Failed to log access:", err);
        }
      }).catch(err => {
        console.error("GeoLocation error:", err);
      });
    }
    next();
  });

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", message: "GigaChad Server is running" });
  });

  // Kiwify Webhook Endpoint
  app.post("/api/kiwify-webhook", async (req, res) => {
    const { order_status, customer, order_id } = req.body;

    console.log(`[KIWIFY] Webhook recebido: ${order_status} para ${customer?.email} (Order: ${order_id})`);

    if (order_status !== "paid") {
      return res.status(200).send("OK");
    }

    try {
      const customerEmail = customer?.email?.toLowerCase()?.trim();
      if (!customerEmail) throw new Error("Email do cliente não fornecido.");

      console.log(`[KIWIFY] Pagamento APROVADO. Processando entrega para ${customerEmail}`);
      
      // 1. Verificar se o cliente já recebeu um código para este e-mail recentemente (evitar duplicidade)
      // Podemos buscar por códigos que foram usados por este e-mail
      const existingCodesQuery = await firestore.collection("accessCodes")
        .where("usedByEmail", "==", customerEmail)
        .orderBy("usedAt", "desc")
        .limit(1)
        .get();

      if (!existingCodesQuery.empty) {
        const existingCode = existingCodesQuery.docs[0].data();
        console.log(`[KIWIFY] Cliente ${customerEmail} já possui o código ${existingCode.code}. Reenviando.`);
        
        // Reenviar e-mail em caso de duplicidade
        sendAccessCodeEmail(customerEmail, existingCode.code);

        return res.status(200).json({ 
          success: true, 
          message: "Código já entregue anteriormente", 
          code: existingCode.code 
        });
      }

      // 2. Tentar pegar um código do estoque (se houver)
      const stockQuery = await firestore.collection("accessCodes")
        .where("used", "==", false)
        .limit(1)
        .get();

      let codeToDeliver: string;

      if (!stockQuery.empty) {
        const codeDoc = stockQuery.docs[0];
        codeToDeliver = codeDoc.data().code;
        
        await codeDoc.ref.update({
          used: true,
          usedByEmail: customerEmail,
          usedAt: admin.firestore.FieldValue.serverTimestamp(),
          orderId: order_id || "manual"
        });
        console.log(`[KIWIFY] Código ${codeToDeliver} do estoque entregue para ${customerEmail}`);
      } else {
        // 3. Se não houver estoque, GERAR UM NOVO CÓDIGO na hora
        codeToDeliver = Math.random().toString(36).substring(2, 10).toUpperCase();
        const createdAt = new Date().toISOString();
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 dias

        await firestore.collection("accessCodes").doc(codeToDeliver).set({
          code: codeToDeliver,
          createdAt,
          expiresAt,
          used: true,
          usedByEmail: customerEmail,
          usedAt: admin.firestore.FieldValue.serverTimestamp(),
          orderId: order_id || "generated"
        });
        console.log(`[KIWIFY] Novo código ${codeToDeliver} GERADO e entregue para ${customerEmail}`);
      }

      // 4. Enviar e-mail profissional
      sendAccessCodeEmail(customerEmail, codeToDeliver);

      res.status(200).json({ 
        success: true, 
        message: "Código entregue com sucesso", 
        code: codeToDeliver 
      });
    } catch (error) {
      console.error("[KIWIFY] Erro ao processar webhook:", error);
      res.status(500).json({ error: "Erro interno ao processar entrega" });
    }
  });

  // Admin Logs Route
  app.route(["/api/admin/logs", "/api/admin/logs/"])
    .post((req, res) => {
      const { password } = req.body;
      
      if (password !== "2011") {
        return res.status(401).json({ error: "Unauthorized" });
      }

      try {
        const logs = db.prepare("SELECT * FROM access_logs ORDER BY timestamp DESC LIMIT 200").all();
        const stats = db.prepare(`
          SELECT 
            ip, city, region, 
            COUNT(*) as count, 
            MAX(timestamp) as last_seen 
          FROM access_logs 
          GROUP BY ip 
          ORDER BY last_seen DESC 
          LIMIT 500
        `).all();
        const blacklist = db.prepare("SELECT * FROM blacklist ORDER BY timestamp DESC").all();
        res.json({ logs, stats, blacklist });
      } catch (err) {
        console.error("Database error in /api/admin/logs:", err);
        res.status(500).json({ error: "Failed to fetch logs from database" });
      }
    })
    .all((req, res) => {
      res.status(405).json({ error: `Method ${req.method} not allowed. Use POST.` });
    });

  // Blacklist Management Endpoints
  app.route(["/api/admin/blacklist", "/api/admin/blacklist/"])
    .post((req, res) => {
      const { password, ip, reason } = req.body;
      if (password !== "2011") return res.status(401).json({ error: "Unauthorized" });

      try {
        db.prepare("INSERT OR REPLACE INTO blacklist (ip, reason) VALUES (?, ?)").run(ip, reason);
        res.json({ success: true });
      } catch (err) {
        res.status(500).json({ error: "Failed to blacklist IP" });
      }
    })
    .delete((req, res) => {
      const { password, ip } = req.body;
      if (password !== "2011") return res.status(401).json({ error: "Unauthorized" });

      try {
        db.prepare("DELETE FROM blacklist WHERE ip = ?").run(ip);
        res.json({ success: true });
      } catch (err) {
        res.status(500).json({ error: "Failed to remove from blacklist" });
      }
    })
    .all((req, res) => {
      res.status(405).json({ error: `Method ${req.method} not allowed. Use POST or DELETE.` });
    });

  // Temporary Test Email Route
  app.get("/api/test-email-now", async (req, res) => {
    const testEmail = "ssrminizin@gmail.com";
    const testCode = "GIGACHAD-TEST-123";
    
    console.log(`[TEST] Enviando e-mail de teste para ${testEmail}`);
    try {
      await sendAccessCodeEmail(testEmail, testCode);
      res.json({ success: true, message: `E-mail de teste enviado para ${testEmail}` });
    } catch (err) {
      res.status(500).json({ success: false, error: "Erro ao enviar e-mail de teste" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production" && !isVercel) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files in production
    const distPath = path.join(__dirname, "dist");
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get("*", (req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
    }
  }

  if (!isVercel) {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://0.0.0.0:${PORT}`);
    });
  }
}

const serverPromise = startServer().catch((err) => {
  console.error("Failed to start server:", err);
  if (!isVercel) process.exit(1);
});

export default async (req: any, res: any) => {
  await serverPromise;
  return app(req, res);
};
