import { ConnectionOptions } from "mysql2";
import mysql, { RowDataPacket } from "mysql2/promise";
import { Connection, ExecutionResult } from "@/types";
import { Connector } from "..";

const systemDatabases = [
  "information_schema",
  "mysql",
  "performance_schema",
  "sys",
];

const getMySQLConnection = async (
  connection: Connection
): Promise<mysql.Connection> => {
  const connectionOptions: ConnectionOptions = {
    host: connection.host,
    port: parseInt(connection.port),
    user: connection.username,
    password: connection.password,
    database: connection.database,
  };
  if (connection.ssl) {
    connectionOptions.ssl = {
      ca: connection.ssl?.ca,
      cert: connection.ssl?.cert,
      key: connection.ssl?.key,
    };
  }
  const conn = await mysql.createConnection(connectionOptions);
  return conn;
};

const testConnection = async (connection: Connection): Promise<boolean> => {
  const conn = await getMySQLConnection(connection);
  conn.destroy();
  return true;
};

const execute = async (
  connection: Connection,
  databaseName: string,
  statement: string
): Promise<any> => {
  connection.database = databaseName;
  const conn = await getMySQLConnection(connection);
  const [rows] = await conn.execute(statement);
  conn.destroy();

  const executionResult: ExecutionResult = {
    rawResult: [],
    affectedRows: 0,
  };
  if (Array.isArray(rows)) {
    executionResult.rawResult = rows;
  } else {
    executionResult.affectedRows = rows.affectedRows;
  }
  return executionResult;
};

const getDatabases = async (connection: Connection): Promise<string[]> => {
  const conn = await getMySQLConnection(connection);
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT schema_name as db_name FROM information_schema.schemata WHERE schema_name NOT IN (?);`,
    [systemDatabases]
  );
  conn.destroy();
  const databaseList = [];
  for (const row of rows) {
    if (row["db_name"]) {
      databaseList.push(row["db_name"]);
    }
  }
  return databaseList;
};

const getTables = async (
  connection: Connection,
  databaseName: string
): Promise<string[]> => {
  const conn = await getMySQLConnection(connection);
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT TABLE_NAME as table_name FROM information_schema.tables WHERE TABLE_SCHEMA=? AND TABLE_TYPE='BASE TABLE';`,
    [databaseName]
  );
  conn.destroy();
  const tableList = [];
  for (const row of rows) {
    if (row["table_name"]) {
      tableList.push(row["table_name"]);
    }
  }
  return tableList;
};

const getTableStructure = async (
  connection: Connection,
  databaseName: string,
  tableName: string,
  structureFetched: (tableName: string, structure: string) => void
): Promise<void> => {
  const conn = await getMySQLConnection(connection);
  const [rows] = await conn.query<RowDataPacket[]>(
    `SHOW CREATE TABLE \`${databaseName}\`.\`${tableName}\`;`
  );
  conn.destroy();
  if (rows.length !== 1) {
    throw new Error("Unexpected number of rows.");
  }
  structureFetched(tableName, rows[0]["Create Table"] || "");
};

const newConnector = (connection: Connection): Connector => {
  return {
    testConnection: () => testConnection(connection),
    execute: (databaseName: string, statement: string) =>
      execute(connection, databaseName, statement),
    getDatabases: () => getDatabases(connection),
    getTables: (databaseName: string) => getTables(connection, databaseName),
    getTableStructure: (
      databaseName: string,
      tableName: string,
      structureFetched: (tableName: string, structure: string) => void
    ) =>
      getTableStructure(connection, databaseName, tableName, structureFetched),
  };
};

export default newConnector;
