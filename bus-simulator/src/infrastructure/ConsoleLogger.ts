import type { Logger } from "../domain/contracts.js";

/** Logger estructurado ligero sobre consola. */
export class ConsoleLogger implements Logger {
  /**
   * Registra un mensaje informativo.
   * @param message Texto del mensaje.
   * @param context Objeto con datos adicionales en formato JSON.
   */
  public info(message: string, context?: Record<string, unknown>): void {
    this.log("INFO", message, context);
  }

  /**
   * Registra una advertencia.
   * @param message Texto del mensaje.
   * @param context Objeto con datos adicionales en formato JSON.
   */
  public warn(message: string, context?: Record<string, unknown>): void {
    this.log("WARN", message, context);
  }

  /**
   * Registra un error.
   * @param message Texto del mensaje.
   * @param context Objeto con datos adicionales en formato JSON.
   */
  public error(message: string, context?: Record<string, unknown>): void {
    this.log("ERROR", message, context);
  }

  /**
   * Formatea y emite un registro a la consola estándar.
   * @param level Nivel del registro (INFO, WARN, ERROR).
   * @param message Texto del mensaje.
   * @param context Objeto con datos estructurados adicionales.
   */
  private log(level: string, message: string, context?: Record<string, unknown>): void {
    const suffix = context ? ` ${JSON.stringify(context)}` : "";
    console.log(`[${level}] ${message}${suffix}`);
  }
}
