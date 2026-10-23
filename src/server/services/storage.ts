import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";

export interface StorageDriver {
  init(): Promise<void>;
  put(key: string, data: Buffer, mime: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

/** Impedisce path traversal: le chiavi sono generate dal server (uuid/file). */
function assertSafeKey(key: string): void {
  if (!/^[a-zA-Z0-9/_.-]+$/.test(key) || key.includes("..")) {
    throw new Error("Chiave di archiviazione non valida");
  }
}

class LocalStorage implements StorageDriver {
  #root: string;
  constructor(root: string) {
    this.#root = path.resolve(root);
  }
  async init(): Promise<void> {
    await fs.mkdir(this.#root, { recursive: true });
  }
  #fullPath(key: string): string {
    assertSafeKey(key);
    const full = path.resolve(this.#root, key);
    if (!full.startsWith(this.#root + path.sep))
      throw new Error("Percorso non consentito");
    return full;
  }
  async put(key: string, data: Buffer): Promise<void> {
    const full = this.#fullPath(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, data, { mode: 0o600 });
  }
  async get(key: string): Promise<Buffer> {
    return fs.readFile(this.#fullPath(key));
  }
  async delete(key: string): Promise<void> {
    try {
      await fs.unlink(this.#fullPath(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

/**
 * Supabase Storage (bucket privato). Le richieste usano la service role key
 * SOLO lato server, con bucket privato e accesso mediato dall'API del CRM:
 * il client non riceve mai URL firmati permanenti né chiavi.
 */
class SupabaseStorage implements StorageDriver {
  #url: string;
  #key: string;
  #bucket: string;
  constructor(url: string, key: string, bucket: string) {
    this.#url = url.replace(/\/$/, "");
    this.#key = key;
    this.#bucket = bucket;
  }
  async init(): Promise<void> {
    const res = await fetch(`${this.#url}/storage/v1/bucket/${this.#bucket}`, {
      headers: { Authorization: `Bearer ${this.#key}`, apikey: this.#key },
    });
    if (res.status === 404) {
      const create = await fetch(`${this.#url}/storage/v1/bucket`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.#key}`,
          apikey: this.#key,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: this.#bucket,
          name: this.#bucket,
          public: false,
        }),
      });
      if (!create.ok)
        throw new Error(
          `Impossibile creare il bucket privato (${create.status})`,
        );
    } else if (!res.ok) {
      throw new Error(`Verifica bucket Supabase fallita (${res.status})`);
    }
  }
  async put(key: string, data: Buffer, mime: string): Promise<void> {
    assertSafeKey(key);
    const res = await fetch(
      `${this.#url}/storage/v1/object/${this.#bucket}/${key}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.#key}`,
          apikey: this.#key,
          "Content-Type": mime,
          "x-upsert": "false",
        },
        body: new Uint8Array(data),
      },
    );
    if (!res.ok)
      throw new Error(`Caricamento documento fallito (${res.status})`);
  }
  async get(key: string): Promise<Buffer> {
    assertSafeKey(key);
    const res = await fetch(
      `${this.#url}/storage/v1/object/${this.#bucket}/${key}`,
      {
        headers: { Authorization: `Bearer ${this.#key}`, apikey: this.#key },
      },
    );
    if (!res.ok) throw new Error(`Documento non disponibile (${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  }
  async delete(key: string): Promise<void> {
    assertSafeKey(key);
    await fetch(`${this.#url}/storage/v1/object/${this.#bucket}/${key}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${this.#key}`, apikey: this.#key },
    });
  }
}

function buildStorage(): StorageDriver {
  if (config.storage.driver === "supabase") {
    if (!config.storage.supabaseUrl || !config.storage.supabaseServiceKey) {
      throw new Error(
        "STORAGE_DRIVER=supabase richiede SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY",
      );
    }
    return new SupabaseStorage(
      config.storage.supabaseUrl,
      config.storage.supabaseServiceKey,
      config.storage.supabaseBucket,
    );
  }
  return new LocalStorage(config.storage.localDir);
}

let driver: StorageDriver | undefined;

export const storage: StorageDriver & { kind: () => string } = {
  async init() {
    driver = buildStorage();
    await driver.init();
  },
  async put(key, data, mime) {
    if (!driver) {
      driver = buildStorage();
      await driver.init();
    }
    return driver.put(key, data, mime);
  },
  async get(key) {
    if (!driver) {
      driver = buildStorage();
      await driver.init();
    }
    return driver.get(key);
  },
  async delete(key) {
    if (!driver) return;
    return driver.delete(key);
  },
  kind: () => config.storage.driver,
};
