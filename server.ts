import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Database
const db = new Database("logs.db");
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

// Simple Geolocation Cache to avoid rate limits
const geoCache = new Map<string, { city: string, region: string }>();

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

async function startServer() {
  const app = express();
  const PORT = 3000;

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

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files in production
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
