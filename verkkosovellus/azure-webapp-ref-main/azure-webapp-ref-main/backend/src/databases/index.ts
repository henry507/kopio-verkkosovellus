import Knex from 'knex';
import { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_DATABASE, DB_SSL } from '@config';

const dbConnection = {
  client: 'pg',
  connection: {
    charset: 'utf8',
    timezone: 'UTC',
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_DATABASE,
    ssl: DB_SSL.toLowerCase() === 'true' ? true : false,
  },
  pool: {
    min: 2,
    max: 10,
  },
};

export default Knex(dbConnection);
