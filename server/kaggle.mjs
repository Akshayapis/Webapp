/**
 * Kaggle API client for the U APP Android build engine.
 * Docs: https://www.kaggle.com/docs/api
 * Credentials are read from server environment only (KAGGLE_USERNAME / KAGGLE_KEY).
 * Basic auth supports the current Kaggle API token format (and legacy key format).
 */
const BASE = "https://www.kaggle.com/api/v1";

export class KaggleError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = "KaggleError";
    this.status = status;
    this.body = body;
  }
}

export class KaggleClient {
  constructor(username, key) {
    this.username = username;
    this.key = key;
    this.headers = { Authorization: `Basic ${Buffer.from(`${username}:${key}`).toString("base64")}` };
  }

  static fromEnv(env = process.env) {
    const username = env.KAGGLE_USERNAME;
    const key = env.KAGGLE_KEY;
    if (!username || !key) return null;
    return new KaggleClient(username, key);
  }

  async request(path, init = {}) {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { ...this.headers, "User-Agent": "uapp-build-service/2.0", ...(init.headers || {}) },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      let body = text;
      try { body = JSON.parse(text); } catch { /* plain text */ }
      const message = body?.message || body?.error || body || `Kaggle API ${res.status}`;
      throw new KaggleError(String(message).slice(0, 400), res.status, body);
    }
    const type = res.headers.get("content-type") || "";
    if (type.includes("application/json")) return res.json();
    return res;
  }

  async verifyCredentials() {
    await this.request(`/kernels/list?user=${encodeURIComponent(this.username)}&pageSize=1`);
    return { ok: true, username: this.username };
  }

  async upsertDataset(datasetSlug, title, files) {
    const ref = `${this.username}/${datasetSlug}`;
    const metadata = { title: title.slice(0, 60), id: ref, licenses: [{ name: "CC0-1.0" }] };
    const form = new FormData();
    form.append("metadata", JSON.stringify(metadata));
    for (const file of files) form.append("file", new Blob([file.content]), file.name);
    const exists = await this.request(`/datasets/view/${ref}`).then(() => true).catch((e) => {
      if (e.status === 404) return false;
      throw e;
    });
    const path = exists ? `/datasets/version/${ref}` : "/datasets/create";
    const data = await this.request(path, { method: "POST", body: form });
    return { ref: data?.ref || ref, version: data?.versionNumber ?? data?.currentVersionNumber ?? null };
  }

  async datasetStatus(ref) {
    return this.request(`/datasets/status/${ref}`);
  }

  async pushKernel(ownerSlug, { title, code, datasetSources }) {
    const ref = `${this.username}/${ownerSlug}`;
    const metadata = {
      id: ref,
      title: title.slice(0, 60),
      code_file: "worker.ipynb",
      language: "python",
      kernel_type: "notebook",
      is_private: true,
      enable_gpu: false,
      enable_internet: true,
      dataset_sources: datasetSources,
      competition_sources: [],
      kernel_sources: [],
      model_sources: [],
    };
    const form = new FormData();
    form.append("metadata", JSON.stringify(metadata));
    form.append("code", new Blob([code], { type: "application/x-ipynb+json" }), "worker.ipynb");
    const data = await this.request("/kernels/push", { method: "POST", body: form });
    return { ref: data?.ref || ref, url: data?.url || `https://www.kaggle.com/code/${ref}`, version: data?.versionNumber ?? null };
  }

  async downloadDataset(ref) {
    const res = await this.request(`/datasets/download/${ref}`);
    if (res instanceof Response) return Buffer.from(await res.arrayBuffer());
    return res;
  }

  async kernelStatus(ref) {
    return this.request(`/kernels/status/${ref}`);
  }

  async kernelOutput(ref) {
    const res = await this.request(`/kernels/output/${ref}`);
    if (!(res instanceof Response) && typeof res?.arrayBuffer === "function") return res;
    if (res instanceof Response) return res;
    return this.request(`/kernels/output/${ref}`);
  }
}

/** Real status names used by Kaggle: queued, running, complete, error, cancelRequested... */
export function normalizeKernelStatus(raw) {
  const status = String(raw?.status ?? raw?.state ?? "unknown").toLowerCase();
  if (status.includes("complete")) return "complete";
  if (status.includes("error") || status.includes("fail")) return "error";
  if (status.includes("run") || status.includes("process") || status === "started") return "running";
  if (status.includes("queue")) return "queued";
  if (status.includes("cancel")) return "cancelled";
  return status;
}
