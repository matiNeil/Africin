/**
 * An in-memory stand-in for the subset of Firestore the referral store uses.
 *
 * It exists to pin down the behaviours the correctness of this system rests
 * on — above all that `create()` on an existing document id fails with
 * ALREADY_EXISTS, which is the single mechanism behind both first-touch
 * attribution and duplicate-webhook rejection. A mock that quietly let a
 * second create win would make those tests prove nothing.
 */

export interface FakeDoc {
  id: string;
  exists: boolean;
  data(): Record<string, unknown> | undefined;
}

class AlreadyExistsError extends Error {
  readonly code = 6;
  constructor(path: string) {
    super(`Document already exists: ${path}`);
  }
}

class NotFoundError extends Error {
  readonly code = 5;
  constructor(path: string) {
    super(`No document to update: ${path}`);
  }
}

type Row = Record<string, unknown>;

export class FakeFirestore {
  readonly collections = new Map<string, Map<string, Row>>();
  private autoId = 0;

  /** Test helper: drop a document straight in, bypassing the write paths. */
  seed(collection: string, id: string, data: Row): void {
    this.rows(collection).set(id, structuredClone(data));
  }

  rows(name: string): Map<string, Row> {
    let collection = this.collections.get(name);
    if (!collection) {
      collection = new Map();
      this.collections.set(name, collection);
    }
    return collection;
  }

  nextId(): string {
    this.autoId += 1;
    return `auto${String(this.autoId).padStart(6, "0")}`;
  }

  collection(name: string): FakeCollection {
    return new FakeCollection(this, name);
  }

  async getAll(...refs: FakeDocRef[]): Promise<FakeDoc[]> {
    return Promise.all(refs.map((ref) => ref.get()));
  }

  /**
   * Runs the body immediately. Tests here are single-threaded, so there is no
   * contention to model; what matters is that reads and writes go through the
   * same store the rest of the suite sees.
   */
  async runTransaction<T>(body: (tx: FakeTransaction) => Promise<T>): Promise<T> {
    return body(new FakeTransaction(this));
  }
}

class FakeTransaction {
  // Written out longhand rather than as constructor parameter properties:
  // Node's type-stripping runs these test files unmodified, and it only
  // erases types, so any TypeScript syntax that *generates* code is out.
  private readonly db: FakeFirestore;

  constructor(db: FakeFirestore) {
    this.db = db;
  }

  async get(ref: FakeDocRef): Promise<FakeDoc> {
    return ref.get();
  }
  set(ref: FakeDocRef, data: Row): void {
    this.db.rows(ref.collectionName).set(ref.id, structuredClone(data));
  }
  update(ref: FakeDocRef, data: Row): void {
    const existing = this.db.rows(ref.collectionName).get(ref.id) ?? {};
    this.db.rows(ref.collectionName).set(ref.id, { ...existing, ...structuredClone(data) });
  }
}

export class FakeDocRef {
  private readonly db: FakeFirestore;
  readonly collectionName: string;
  readonly id: string;

  constructor(db: FakeFirestore, collectionName: string, id: string) {
    this.db = db;
    this.collectionName = collectionName;
    this.id = id;
  }

  async get(): Promise<FakeDoc> {
    const data = this.db.rows(this.collectionName).get(this.id);
    return {
      id: this.id,
      exists: data !== undefined,
      data: () => (data === undefined ? undefined : structuredClone(data)),
    };
  }

  async set(data: Row, options?: { merge?: boolean }): Promise<void> {
    const rows = this.db.rows(this.collectionName);
    const existing = options?.merge ? (rows.get(this.id) ?? {}) : {};
    rows.set(this.id, { ...existing, ...structuredClone(data) });
  }

  /** Fails if the document is already there — the whole point of this double. */
  async create(data: Row): Promise<void> {
    const rows = this.db.rows(this.collectionName);
    if (rows.has(this.id)) throw new AlreadyExistsError(`${this.collectionName}/${this.id}`);
    rows.set(this.id, structuredClone(data));
  }

  async update(data: Row): Promise<void> {
    const rows = this.db.rows(this.collectionName);
    const existing = rows.get(this.id);
    if (!existing) throw new NotFoundError(`${this.collectionName}/${this.id}`);
    rows.set(this.id, { ...existing, ...structuredClone(data) });
  }
}

type Filter = [string, string, unknown];

export class FakeCollection {
  private readonly filters: Filter[] = [];
  private order: { field: string; direction: "asc" | "desc" } | null = null;
  private limitValue: number | null = null;

  private readonly db: FakeFirestore;
  private readonly name: string;

  constructor(db: FakeFirestore, name: string) {
    this.db = db;
    this.name = name;
  }

  doc(id?: string): FakeDocRef {
    return new FakeDocRef(this.db, this.name, id ?? this.db.nextId());
  }

  async add(data: Row): Promise<FakeDocRef> {
    const ref = this.doc();
    await ref.set(data);
    return ref;
  }

  where(field: string, operator: string, value: unknown): FakeCollection {
    const next = this.clone();
    next.filters.push([field, operator, value]);
    return next;
  }

  orderBy(field: string, direction: "asc" | "desc" = "asc"): FakeCollection {
    const next = this.clone();
    next.order = { field, direction };
    return next;
  }

  limit(count: number): FakeCollection {
    const next = this.clone();
    next.limitValue = count;
    return next;
  }

  count(): { get(): Promise<{ data(): { count: number } }> } {
    return {
      get: async () => {
        const docs = await this.resolve();
        return { data: () => ({ count: docs.length }) };
      },
    };
  }

  async get(): Promise<{ empty: boolean; docs: FakeDoc[] }> {
    const docs = await this.resolve();
    return { empty: docs.length === 0, docs };
  }

  private clone(): FakeCollection {
    const next = new FakeCollection(this.db, this.name);
    next.filters.push(...this.filters);
    next.order = this.order;
    next.limitValue = this.limitValue;
    return next;
  }

  private async resolve(): Promise<FakeDoc[]> {
    let entries = [...this.db.rows(this.name).entries()];

    for (const [field, operator, value] of this.filters) {
      entries = entries.filter(([, row]) => {
        const actual = row[field];
        switch (operator) {
          case "==":
            return actual === value;
          case ">=":
            return typeof actual === "string" && typeof value === "string" && actual >= value;
          case "<=":
            return typeof actual === "string" && typeof value === "string" && actual <= value;
          default:
            throw new Error(`Unsupported operator in test double: ${operator}`);
        }
      });
    }

    if (this.order) {
      const { field, direction } = this.order;
      entries.sort(([, a], [, b]) => {
        const left = String(a[field] ?? "");
        const right = String(b[field] ?? "");
        return direction === "asc" ? left.localeCompare(right) : right.localeCompare(left);
      });
    }

    if (this.limitValue != null) entries = entries.slice(0, this.limitValue);

    return entries.map(([id, row]) => ({
      id,
      exists: true,
      data: () => structuredClone(row),
    }));
  }
}

/**
 * The store functions are typed against the real `Firestore`. The double
 * implements the slice of it they touch; the cast is the seam, and it is
 * confined to this one helper so a drift in the real API surfaces as a type
 * error at the store instead of silently passing here.
 */
export function fakeDb(): FakeFirestore {
  return new FakeFirestore();
}
