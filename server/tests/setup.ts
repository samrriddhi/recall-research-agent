// Each test process gets an isolated in-memory database. Set this before
// application modules import the validated environment configuration.
process.env.DATABASE_PATH = ":memory:";
