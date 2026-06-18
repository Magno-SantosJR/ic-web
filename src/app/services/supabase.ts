import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  public client: SupabaseClient;

  constructor() {
    this.client = createClient(
      'https://hudkxqqzmvpvzhfnpueg.supabase.co', // Sua URL do Supabase
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh1ZGt4cXF6bXZwdnpoZm5wdWVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMTUzMTUsImV4cCI6MjA5NTg5MTMxNX0.tKK2OsJY_iKB5O88Vll5iABl0w1qyxWpQqTNZKv4jWY',                      // Sua chave pública anon
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          // 🟢 SOLUÇÃO COMPATÍVEL COM A SUA VERSÃO:
          // Mudamos o nome da chave padrão de autenticação. 
          // Isso faz o Supabase criar uma trilha isolada no localStorage,
          // evitando que ele concorra com sessões fantasmas antigas que travaram o LockManager do Chrome.
          storageKey: 'icweb-deposito-token',
          // 🟢 O TIRO DE MISERICÓRDIA NO LOCKMANAGER:
          // Injetamos um manipulador de lock customizado que ignora o LockManager do Chrome.
          // Como o método retorna imediatamente sem disputar travas com o navegador,
          // o NavigatorLockAcquireTimeoutError é extinto para sempre!
          lock: async (name: string, acquireTimeout: number, callback: () => Promise<any>) => {
              return await callback();
          }
        }
      }
    );
  }
}