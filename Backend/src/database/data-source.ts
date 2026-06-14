import { DataSource } from "typeorm";
import { config } from "dotenv";

config(); // Load variables from .env

// This DataSource is used by the TypeORM CLI (migration:generate / run /
// revert). It must stay in sync with the runtime configuration declared in
// app.module.ts: same env var names, same pool settings, synchronize disabled.
export const AppDataSource = new DataSource({
    type: "postgres",
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 5432,
    username: process.env.DB_USERNAME || "postgres",
    password: process.env.DB_PASSWORD || "password",
    database: process.env.DB_DATABASE || "stellara_workflows",
    synchronize: false, // Always false: schema is migration-managed.
    logging: true,
    entities: ["src/**/*.entity{.ts,.js}"],
    migrations: ["src/database/migrations/*{.ts,.js}"],
    // Mirror the runtime connection pool limits from app.module.ts.
    extra: {
        max: 20,
        min: 5,
        idleTimeoutMillis: 30000,
    },
});
