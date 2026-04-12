/**
 * DuckDB connection helper
 * Opens the hvac_portfolio.duckdb file and provides a query function.
 * The .duckdb file sits at the project root (copied there during build/deploy).
 */
import path from "path";

const DB_PATH = path.join(process.cwd(), "hvac_portfolio.duckdb");

// eslint-disable-next-line @typescript-eslint/no-require-imports
const duckdb = require("duckdb");

let dbInstance: InstanceType<typeof duckdb.Database> | null = null;

function getDb(): Promise<InstanceType<typeof duckdb.Database>> {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const db = new duckdb.Database(
      DB_PATH,
      { access_mode: "READ_ONLY" },
      (err: Error | null) => {
        if (err) return reject(err);
        dbInstance = db;
        resolve(db);
      }
    );
  });
}

/**
 * Run a read-only SQL query against the DuckDB database.
 * Returns an array of row objects.
 */
export async function query<T = Record<string, unknown>>(
  sql: string
): Promise<T[]> {
  const db = await getDb();

  return new Promise((resolve, reject) => {
    db.all(sql, (err: Error | null, rows: Record<string, unknown>[]) => {
      if (err) return reject(err);
      // Convert BigInt values to regular numbers (JSON can't serialize BigInt)
      const converted = rows.map((row) => {
        const obj: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(row)) {
          obj[key] = typeof value === "bigint" ? Number(value) : value;
        }
        return obj;
      });
      resolve(converted as T[]);
    });
  });
}
