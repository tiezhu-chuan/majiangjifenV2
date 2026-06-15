// Custom Self-Contained Local DB & Mock Firebase SDK
// This maintains 100% API compatibility with the code, while completely decoupling from Firebase Cloud

// Custom Timestamp mock to mirror Firestore's Timestamp
export class Timestamp {
  constructor(public seconds: number, public nanoseconds: number) {}

  static now() {
    return Timestamp.fromDate(new Date());
  }

  static fromDate(date: Date) {
    const ms = date.getTime();
    return new Timestamp(Math.floor(ms / 1000), (ms % 1000) * 1000000);
  }

  toDate() {
    return new Date(this.seconds * 1000 + Math.floor(this.nanoseconds / 1000000));
  }

  toISOString() {
    return this.toDate().toISOString();
  }
}

// Helpers for serializing/deserializing Timestamp shapes on standard HTTP transfers
function parseTimestamps(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  if (obj.seconds !== undefined && obj.nanoseconds !== undefined && Object.keys(obj).length === 2) {
    return new Timestamp(obj.seconds, obj.nanoseconds);
  }
  if (Array.isArray(obj)) {
    return obj.map(item => parseTimestamps(item));
  }
  const result: any = {};
  for (const [key, val] of Object.entries(obj)) {
    result[key] = parseTimestamps(val);
  }
  return result;
}

function serializeTimestamps(obj: any): any {
  if (!obj) return obj;
  if (obj instanceof Timestamp) {
    return { seconds: obj.seconds, nanoseconds: obj.nanoseconds };
  }
  if (obj instanceof Date) {
    const ms = obj.getTime();
    return { seconds: Math.floor(ms / 1000), nanoseconds: (ms % 1000) * 1000000 };
  }
  if (Array.isArray(obj)) {
    return obj.map(item => serializeTimestamps(item));
  }
  if (typeof obj === 'object') {
    const result: any = {};
    for (const [key, val] of Object.entries(obj)) {
      result[key] = serializeTimestamps(val);
    }
    return result;
  }
  return obj;
}

// Mock auth representation
export class MockAuth {
  private listeners: ((user: any) => void)[] = [];
  public currentUser: any = null;

  constructor() {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('mahjong_user');
      if (stored) {
        try {
          this.currentUser = JSON.parse(stored);
        } catch (_) {}
      }
    }
  }

  onAuthStateChanged(callback: (user: any) => void) {
    this.listeners.push(callback);
    setTimeout(() => {
      callback(this.currentUser);
    }, 0);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  setCurrentUser(user: any) {
    this.currentUser = user;
    if (typeof window !== 'undefined') {
      if (user) {
        localStorage.setItem('mahjong_user', JSON.stringify(user));
      } else {
        localStorage.removeItem('mahjong_user');
      }
    }
    this.listeners.forEach(l => l(user));
  }
}

// Standalone function exported exactly like firebase/auth
export function onAuthStateChanged(authInstance: MockAuth, callback: (user: any) => void) {
  return authInstance.onAuthStateChanged(callback);
}

// Global Auth and DB Mock Instances
export const auth = new MockAuth();
export const db = { _name: 'local-mock-db' };

// Auth API Methods
export async function signInWithEmailAndPassword(authInstance: any, email: string, pass: string) {
  const res = await fetch('/api/custom-auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: pass })
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const err = new Error(data.message || '登录失败');
    (err as any).code = data.code || 'auth/wrong-password';
    throw err;
  }
  const data = await res.json();
  const user = { uid: data.uid, email: data.email };
  auth.setCurrentUser(user);
  return { user };
}

export async function createUserWithEmailAndPassword(authInstance: any, email: string, pass: string) {
  const res = await fetch('/api/custom-auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: pass })
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const err = new Error(data.message || '注册失败');
    (err as any).code = data.code || 'auth/email-already-in-use';
    throw err;
  }
  const data = await res.json();
  const user = { uid: data.uid, email: data.email };
  auth.setCurrentUser(user);
  return { user };
}

export async function signOut(authInstance: any) {
  auth.setCurrentUser(null);
}

// Google Auth placeholder
export class GoogleAuthProvider {
  setCustomParameters(params?: any) {}
}
export async function signInWithPopup(authInstance?: any, provider?: any): Promise<any> {
  throw new Error('当前系统已升级为低延迟本地自建库，暂不支持外部 Google 第三方登录。请直接使用用户名和密码进行注册与登录！');
}

// Firestore Database Reference simulation
export class DBRef {
  _isCollection: boolean;
  path: string;
  id: string;

  constructor(path: string, isCollection: boolean) {
    this.path = path;
    this._isCollection = isCollection;
    const parts = path.split('/');
    this.id = parts[parts.length - 1] || '';
  }
}

export function doc(dbOrRef: any, pathOrCol?: string, ...rest: string[]) {
  if (!pathOrCol) {
    // Called like: doc(collectionRef) -> generates an auto-ID reference
    const parentPath = dbOrRef.path;
    const randomId = 'doc_' + Math.random().toString(36).substring(2, 11);
    return new DBRef(`${parentPath}/${randomId}`, false);
  }
  let fullPath = '';
  if (dbOrRef && dbOrRef._isCollection) {
    fullPath = [dbOrRef.path, pathOrCol, ...rest].join('/');
  } else if (dbOrRef && dbOrRef.path) {
    fullPath = [dbOrRef.path, pathOrCol, ...rest].join('/');
  } else {
    fullPath = [pathOrCol, ...rest].join('/');
  }
  return new DBRef(fullPath, false);
}

export function collection(dbOrRef: any, pathOrCol?: string, ...rest: string[]) {
  if (!pathOrCol) {
    return dbOrRef;
  }
  let fullPath = '';
  if (dbOrRef && dbOrRef.path) {
    fullPath = [dbOrRef.path, pathOrCol, ...rest].join('/');
  } else {
    fullPath = [pathOrCol, ...rest].join('/');
  }
  return new DBRef(fullPath, true);
}

// Query structure
export function query(colRef: DBRef, ...constraints: any[]) {
  const q = {
    _isCollection: true,
    path: colRef.path,
    where: [] as any[],
    orderBy: [] as any[],
    limit: undefined as number | undefined
  };
  for (const c of constraints) {
    if (c.type === 'where') {
      q.where.push({ field: c.field, op: c.op, value: c.value });
    } else if (c.type === 'orderBy') {
      q.orderBy.push({ field: c.field, direction: c.direction });
    } else if (c.type === 'limit') {
      q.limit = c.value;
    }
  }
  return q;
}

export function where(field: string, op: string, value: any) {
  return { type: 'where', field, op, value };
}

export function orderBy(field: string, direction: 'asc' | 'desc' = 'asc') {
  return { type: 'orderBy', field, direction };
}

export function limit(val: number) {
  return { type: 'limit', value: val };
}

// Document Snapshots and Query Snapshots
export class DocumentSnapshot {
  constructor(private _exists: boolean, private _data: any, public id: string, public ref: DBRef) {}
  exists() {
    return this._exists;
  }
  data() {
    return this._data;
  }
}

export class QuerySnapshot {
  public docs: DocumentSnapshot[] = [];
  constructor(docs: DocumentSnapshot[]) {
    this.docs = docs;
  }
  get empty() {
    return this.docs.length === 0;
  }
  forEach(callback: (doc: DocumentSnapshot) => void) {
    this.docs.forEach(callback);
  }
}

// Firestore Database Operations Client Wrapper
export async function getDoc(docRef: DBRef | any) {
  const response = await fetch('/api/custom-db/get', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: docRef.path })
  });
  if (!response.ok) {
    throw new Error(`getDoc 失败: ${docRef.path}`);
  }
  const { exists, data } = await response.json();
  const parsedData = parseTimestamps(data);
  return new DocumentSnapshot(exists, parsedData, docRef.id, docRef);
}

export async function getDocs(queryOrColRef: DBRef | any) {
  const payload = {
    path: queryOrColRef.path,
    where: queryOrColRef.where || [],
    orderBy: queryOrColRef.orderBy || [],
    limit: queryOrColRef.limit
  };
  const response = await fetch('/api/custom-db/get-docs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error(`getDocs 失败: ${queryOrColRef.path}`);
  }
  const { docs } = await response.json();
  const docSnaps = docs.map((d: any) => {
    const parsedData = parseTimestamps(d.data);
    const docRef = doc(db, queryOrColRef.path, d.id);
    return new DocumentSnapshot(true, parsedData, d.id, docRef);
  });
  return new QuerySnapshot(docSnaps);
}

export async function setDoc(docRef: DBRef, data: any, options?: any) {
  const serialized = serializeTimestamps(data);
  const response = await fetch('/api/custom-db/set', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: docRef.path, data: serialized })
  });
  if (!response.ok) {
    throw new Error(`setDoc 失败: ${docRef.path}`);
  }
}

export async function updateDoc(docRef: DBRef, data: any) {
  const serialized = serializeTimestamps(data);
  const response = await fetch('/api/custom-db/update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: docRef.path, data: serialized })
  });
  if (!response.ok) {
    throw new Error(`updateDoc 失败: ${docRef.path}`);
  }
}

export async function addDoc(colRef: DBRef, data: any) {
  const serialized = serializeTimestamps(data);
  const response = await fetch('/api/custom-db/add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: colRef.path, data: serialized })
  });
  if (!response.ok) {
    throw new Error(`addDoc 失败: ${colRef.path}`);
  }
  const { id } = await response.json();
  return { id };
}

// writeBatch support
export function writeBatch(dbInstance: any) {
  const operations: { type: 'set' | 'update' | 'delete'; path: string; data: any }[] = [];
  return {
    set(docRef: any, data: any) {
      operations.push({ type: 'set', path: docRef.path, data });
    },
    update(docRef: any, data: any) {
      operations.push({ type: 'update', path: docRef.path, data });
    },
    delete(docRef: any) {
      operations.push({ type: 'delete', path: docRef.path, data: null });
    },
    async commit() {
      const response = await fetch('/api/custom-db/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operations: serializeTimestamps(operations) })
      });
      if (!response.ok) {
        throw new Error('batch commit 失败');
      }
    }
  };
}

// runTransaction support
export async function runTransaction(dbInstance: any, callback: (transaction: any) => Promise<any>) {
  const tx = {
    get: async (ref: any) => {
      return await getDoc(ref);
    },
    update: (ref: any, data: any) => {
      // Execute eagerly in a local single-process JS environment
      updateDoc(ref, data);
    },
    set: (ref: any, data: any) => {
      setDoc(ref, data);
    }
  };
  return await callback(tx);
}

// serverTimestamp helper creator
export function serverTimestamp() {
  const now = new Date();
  return { seconds: Math.floor(now.getTime() / 1000), nanoseconds: (now.getTime() % 1000) * 1000000 };
}

// polling based onSnapshot implementation to support 100% firewalled offline networks reliably
export function onSnapshot(
  queryOrDocRef: any,
  onNext: (snapshot: any) => void,
  onError?: (error: any) => void
) {
  let active = true;
  let previousHash = '';

  const poll = async () => {
    if (!active) return;
    try {
      const snap = await (queryOrDocRef._isCollection ? getDocs(queryOrDocRef) : getDoc(queryOrDocRef));
      if (!active) return;
      
      const isCollection = !!queryOrDocRef._isCollection;
      const snapAny = snap as any;
      const currentHash = JSON.stringify(isCollection ? snapAny.docs.map((d: any) => d.data()) : snapAny.data());
      
      if (currentHash !== previousHash) {
        previousHash = currentHash;
        onNext(snap);
      }
    } catch (err) {
      console.error('onSnapshot poll 出错:', err);
      if (onError) onError(err);
    }
    if (active) {
      setTimeout(poll, 1500); // 1.5 seconds polling interval
    }
  };

  poll();

  return () => {
    active = false;
  };
}

// Error Handling Infrastructure
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
    },
    operationType,
    path
  };
  console.error('Local Firestore Error Info: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
