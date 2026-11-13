
import { sql } from "drizzle-orm";
import { db, pool } from "./index.js";

async function checkDatabase() {
  try {
    const result = await db.execute(sql`
      SELECT
        current_database() AS database,
        current_user AS username,
        NOW() AS server_time
    `);

    console.log("PostgreSQL connection successful!");
    console.log(result.rows[0]);
  } catch (error) {
    console.error("PostgreSQL connection failed:", error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

checkDatabase();
