declare module 'sql.js' {
  export interface SqlJsStatic {
    Database: new (data?: ArrayLike<number>) => Database;
  }

  export interface Database {
    run(sql: string, params?: any[]): Database;
    exec(sql: string, params?: any[]): QueryExecResult[];
    each(
      sql: string,
      params: any[],
      callback: (row: any) => void,
      done: () => void,
    ): Database;
    prepare(sql: string): Statement;
    close(): void;
    getRowsModified(): number;
    export(): Uint8Array;
  }

  export interface QueryExecResult {
    columns: string[];
    values: any[][];
  }

  export interface Statement {
    bind(params?: any[]): boolean;
    step(): boolean;
    getAsObject(params?: any): any;
    get(params?: any): any[];
    run(params?: any[]): void;
    free(): void;
  }

  export default function initSqlJs(config?: any): Promise<SqlJsStatic>;
}
