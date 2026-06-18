import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private isAdminGlobal = false;
  private nomeUsuarioGlobal = ''; // 👈 Adicionado para guardar o nome na sessão local

  constructor(private supabase: SupabaseService) {}

  // Cadastro de novos operadores no padrão: NOME SOBRENOME
  async cadastrarNovoUsuario(email: string, password: string, nome: string) {
    const { data, error: authError } = await this.supabase.client.auth.signUp({
      email,
      password
    });

    if (authError) throw authError;

    if (data?.user) {
      const { error: perfilError } = await this.supabase.client
        .from('perfis')
        .insert({
          id_usuario: data.user.id,
          role: 'user',
          nome: nome.trim().toUpperCase()
        });

      if (perfilError) console.error('Erro ao criar registro na tabela perfis:', perfilError);
    }

    return data;
  }

  // Enviar e-mail de recuperação de senha
  async enviarEmailRecuperacao(email: string): Promise<void> {
    const { error } = await this.supabase.client.auth.resetPasswordForEmail(email, {
      redirectTo: 'http://localhost:4200/dashboard', // URL que configuramos no painel
    });

    if (error) {
      throw new Error(error.message);
    }
  }

  // Atualizar a senha de fato (depois que o usuário já clicou no link e entrou no app)
  async atualizarSenhaNova(senhaNova: string): Promise<void> {
    const { error } = await this.supabase.client.auth.updateUser({
      password: senhaNova
    });

    if (error) {
      throw new Error(error.message);
    }
  }

  async login(email: string, password: string) {
    const { data, error } = await this.supabase.client.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    if (data?.user) {
      const { data: perfil } = await this.supabase.client
        .from('perfis')
        .select('role, nome') // 👈 Buscando a coluna 'nome' junto com a 'role'
        .eq('id_usuario', data.user.id)
        .single();

      if (perfil) {
        this.isAdminGlobal = perfil.role === 'admin';
        this.nomeUsuarioGlobal = perfil.nome || ''; // 👈 Armazena o nome da Denise/Magno
      } else {
        // Fallback de segurança para não deixar as flags vazias no primeiro redirecionamento
        this.isAdminGlobal = false;
        this.nomeUsuarioGlobal = 'OPERADOR';
      }
    }

    return data;
  }

  async logout() {
    const { error } = await this.supabase.client.auth.signOut();
    if (error) throw error;
    this.isAdminGlobal = false;
    this.nomeUsuarioGlobal = ''; // Limpa os dados ao sair
  }

  async ObterUsuarioId(): Promise<string | null> {
    const { data, error } = await this.supabase.client.auth.getUser();
    
    if (error || !data || !data.user) {
      return null;
    }

    if (data.user && (!this.isAdminGlobal || !this.nomeUsuarioGlobal)) {
      const { data: perfil } = await this.supabase.client
        .from('perfis')
        .select('role, nome') // 👈 Buscando o nome na revalidação de sessão
        .eq('id_usuario', data.user.id)
        .single();
      
      if (perfil) {
        this.isAdminGlobal = perfil.role === 'admin';
        this.nomeUsuarioGlobal = perfil.nome || '';
      }
    }
    
    return data.user.id;
  }

  // 🟢 MÉTODO COMPLEMENTAR: Retorna o nome do usuário ativo para o Dashboard
  obterNomeUsuario(): string {
    return this.nomeUsuarioGlobal;
  }

  seEhAdmin(): boolean {
    return this.isAdminGlobal;
  }
}