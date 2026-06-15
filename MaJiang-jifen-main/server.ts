import { GoogleGenAI } from "@google/genai";
import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Local storage paths
  const USERS_FILE = path.join(process.cwd(), 'users.json');
  const DB_FILE = path.join(process.cwd(), 'db.json');

  // In-memory caches to secure fast read performance
  let usersData: { [email: string]: { uid: string; email: string; passwordHash: string } } = {};
  let dbData: { [path: string]: any } = {};

  // Load persistence files
  try {
    if (fs.existsSync(USERS_FILE)) {
      usersData = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('Failed reading users.json:', err);
  }

  try {
    if (fs.existsSync(DB_FILE)) {
      dbData = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('Failed reading db.json:', err);
  }

  // Sync savers
  const saveUsers = () => {
    try {
      fs.writeFileSync(USERS_FILE, JSON.stringify(usersData, null, 2), 'utf8');
    } catch (err) {
      console.error('Failed saving users.json:', err);
    }
  };

  const saveDb = () => {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(dbData, null, 2), 'utf8');
    } catch (err) {
      console.error('Failed saving db.json:', err);
    }
  };

  // Enable JSON body parsing specifically for our local endpoints
  app.use('/api/custom-auth', express.json({ limit: '15mb' }));
  app.use('/api/custom-db', express.json({ limit: '15mb' }));

  // Global lazy initialisation for optional Gemini API as per best practice helper
  let ai: GoogleGenAI | null = null;
  function getGemini() {
    if (!ai) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (apiKey) {
        ai = new GoogleGenAI({ apiKey });
      }
    }
    return ai;
  }

  function usernameToEmail(username: string): string {
    const clean = username.trim().toLowerCase();
    const encoded = Buffer.from(clean).toString('base64').replace(/[+/=]/g, (c) => {
      return c === '+' ? '-' : c === '/' ? '_' : '';
    }).substring(0, 20);
    return `${encoded}@mahjong-app.com`;
  }

  app.post('/api/custom-auth/register', (req: any, res: any) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Missing parameters', code: 'auth/invalid-email' });
    }
    const cleanEmail = String(email).trim().toLowerCase();
    if (usersData[cleanEmail]) {
      return res.status(400).json({ error: '用户已存在', code: 'auth/email-already-in-use' });
    }
    const uid = 'user_' + Math.random().toString(36).substring(2, 11);
    usersData[cleanEmail] = { uid, email: cleanEmail, passwordHash: password };
    saveUsers();
    res.json({ uid, email: cleanEmail });
  });

  app.post('/api/custom-auth/login', (req: any, res: any) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Missing parameters', code: 'auth/invalid-email' });
    }
    const cleanEmail = String(email).trim().toLowerCase();
    const user = usersData[cleanEmail];
    if (!user) {
      return res.status(400).json({ error: '用户不存在', code: 'auth/user-not-found' });
    }
    if (user.passwordHash !== password) {
      return res.status(400).json({ error: '密码错误', code: 'auth/wrong-password' });
    }
    res.json({ uid: user.uid, email: user.email });
  });

  // --- 2. LOCAL CUSTOM DATABASE ENDPOINTS ---
  app.post('/api/custom-db/get', (req: any, res: any) => {
    const { path } = req.body;
    const record = dbData[path];
    res.json({ exists: record !== undefined, data: record || null });
  });

  app.post('/api/custom-db/set', (req: any, res: any) => {
    const { path, data } = req.body;
    dbData[path] = data;
    saveDb();
    res.json({ success: true });
  });

  app.post('/api/custom-db/update', (req: any, res: any) => {
    const { path, data } = req.body;
    dbData[path] = { ...(dbData[path] || {}), ...data };
    saveDb();
    res.json({ success: true });
  });

  app.post('/api/custom-db/add', (req: any, res: any) => {
    const { path, data } = req.body;
    const id = 'id_' + Math.random().toString(36).substring(2, 11);
    const fullPath = `${path}/${id}`;
    const record = { ...(data || {}), id };
    dbData[fullPath] = record;
    saveDb();
    res.json({ id });
  });

  app.post('/api/custom-db/batch', (req: any, res: any) => {
    const { operations } = req.body;
    if (Array.isArray(operations)) {
      for (const op of operations) {
        const { type, path, data } = op;
        if (type === 'set') {
          dbData[path] = data;
        } else if (type === 'update') {
          dbData[path] = { ...(dbData[path] || {}), ...data };
        }
      }
      saveDb();
    }
    res.json({ success: true });
  });

  app.post('/api/custom-db/get-docs', (req: any, res: any) => {
    const { path: colPath, where, orderBy, limit } = req.body;

    // Filter keys corresponding to direct children of colPath collection
    let keys = Object.keys(dbData).filter(key => {
      if (!key.startsWith(colPath + '/')) return false;
      const remainder = key.substring(colPath.length + 1);
      return remainder.split('/').length === 1 && remainder.length > 0;
    });

    let docs = keys.map(key => {
      const parts = key.split('/');
      const id = parts[parts.length - 1];
      return { id, data: dbData[key] };
    });

    // Apply where filter clauses
    if (where && Array.isArray(where)) {
      for (const filter of where) {
        const { field, op, value } = filter;
        docs = docs.filter(doc => {
          const docData = doc.data || {};
          const fieldVal = docData[field];
          if (op === '==') {
            return fieldVal === value;
          }
          return true;
        });
      }
    }

    // Apply orderBy sorting queries
    if (orderBy && Array.isArray(orderBy)) {
      for (const order of orderBy) {
        const { field, direction } = order;
        docs.sort((a, b) => {
          const valA = (a.data || {})[field];
          const valB = (b.data || {})[field];
          if (valA === undefined) return 1;
          if (valB === undefined) return -1;

          // Parse firestore pseudo-timestamp serialized shapes or custom format
          const valSecondsA = valA && typeof valA === 'object' && valA.seconds !== undefined ? valA.seconds : null;
          const valSecondsB = valB && typeof valB === 'object' && valB.seconds !== undefined ? valB.seconds : null;

          let compare = 0;
          if (valSecondsA !== null && valSecondsB !== null) {
            compare = valSecondsA - valSecondsB;
          } else if (typeof valA === 'number' && typeof valB === 'number') {
            compare = valA - valB;
          } else {
            compare = String(valA).localeCompare(String(valB));
          }
          return direction === 'desc' ? -compare : compare;
        });
      }
    }

    // Apply limit constraint
    if (typeof limit === 'number' && limit > 0) {
      docs = docs.slice(0, limit);
    }

    res.json({ docs });
  });

  // --- 3. LEGACY FIREBASE APIS PROXY FOR BACKWARD COMPATIBILITY ---
  app.all('/api/firebase-auth/identitytoolkit/*', express.raw({ type: '*/*', limit: '10mb' }), async (req, res) => {
    try {
      const subPath = req.path.replace(/^\/api\/firebase-auth\/identitytoolkit/, '');
      const queryStr = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
      const targetUrl = `https://identitytoolkit.googleapis.com${subPath}${queryStr}`;

      const headers: { [key: string]: string } = {};
      for (const [key, val] of Object.entries(req.headers)) {
        if (key.toLowerCase() !== 'host' && key.toLowerCase() !== 'content-length' && val) {
          headers[key] = Array.isArray(val) ? val.join(', ') : val;
        }
      }

      const response = await fetch(targetUrl, {
        method: req.method,
        headers,
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : req.body,
      });

      res.status(response.status);
      response.headers.forEach((value, name) => {
        if (name.toLowerCase() !== 'content-encoding' && name.toLowerCase() !== 'transfer-encoding') {
          res.setHeader(name, value);
        }
      });

      const resBody = await response.arrayBuffer();
      res.send(Buffer.from(resBody));
    } catch (err: any) {
      console.error('IdentityToolkit Proxy Error:', err);
      res.status(500).json({ error: 'Proxy failed', details: err.message });
    }
  });

  app.all('/api/firebase-auth/securetoken/*', express.raw({ type: '*/*', limit: '10mb' }), async (req, res) => {
    try {
      const subPath = req.path.replace(/^\/api\/firebase-auth\/securetoken/, '');
      const queryStr = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
      const targetUrl = `https://securetoken.googleapis.com${subPath}${queryStr}`;

      const headers: { [key: string]: string } = {};
      for (const [key, val] of Object.entries(req.headers)) {
        if (key.toLowerCase() !== 'host' && key.toLowerCase() !== 'content-length' && val) {
          headers[key] = Array.isArray(val) ? val.join(', ') : val;
        }
      }

      const response = await fetch(targetUrl, {
        method: req.method,
        headers,
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : req.body,
      });

      res.status(response.status);
      response.headers.forEach((value, name) => {
        if (name.toLowerCase() !== 'content-encoding' && name.toLowerCase() !== 'transfer-encoding') {
          res.setHeader(name, value);
        }
      });

      const resBody = await response.arrayBuffer();
      res.send(Buffer.from(resBody));
    } catch (err: any) {
      console.error('SecureToken Proxy Error:', err);
      res.status(500).json({ error: 'Proxy failed', details: err.message });
    }
  });

  app.all('/api/firestore-proxy/*', express.raw({ type: '*/*', limit: '10mb' }), async (req, res) => {
    try {
      const subPath = req.path.replace(/^\/api\/firestore-proxy/, '');
      const queryStr = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
      const targetUrl = `https://firestore.googleapis.com${subPath}${queryStr}`;

      const headers: { [key: string]: string } = {};
      for (const [key, val] of Object.entries(req.headers)) {
        if (key.toLowerCase() !== 'host' && key.toLowerCase() !== 'content-length' && val) {
          headers[key] = Array.isArray(val) ? val.join(', ') : val;
        }
      }

      const response = await fetch(targetUrl, {
        method: req.method,
        headers,
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : req.body,
      });

      res.status(response.status);
      response.headers.forEach((value, name) => {
        if (name.toLowerCase() !== 'content-encoding' && name.toLowerCase() !== 'transfer-encoding') {
          res.setHeader(name, value);
        }
      });

      const resBody = await response.arrayBuffer();
      res.send(Buffer.from(resBody));
    } catch (err: any) {
      console.error('Firestore Proxy Error:', err);
      res.status(500).json({ error: 'Proxy failed', details: err.message });
    }
  });

  // Simple local health endpoint
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
