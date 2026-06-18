import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth';
import { Router } from '@angular/router';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {
  // Campos do formulário vinculados via [(ngModel)]
  nome = '';
  email = '';
  password = '';
  
  // Variáveis de controle de estado e mensagens
  erroMensagem = '';
  sucessoMensagem = '';
  modoCadastro = false;

  constructor(private authService: AuthService, private router: Router) {}

  async onSubmit() {
    this.erroMensagem = '';
    this.sucessoMensagem = '';

    // Limpa espaços invisíveis nas extremidades
    this.email = this.email.trim();

    try {
      if (this.modoCadastro) {
        // 🚨 VALIDAÇÃO: Garante o padrão "NOME SOBRENOME" (pelo menos duas palavras)
        const regexNomeSobrenome = /^[A-Za-zÀ-ÖØ-öø-ÿ]+ \s*[A-Za-zÀ-ÖØ-öø-ÿ]+/;

        if (!this.nome || !regexNomeSobrenome.test(this.nome.trim())) {
          this.erroMensagem = 'Por favor, digite seu nome e sobrenome no padrão: NOME SOBRENOME';
          return;
        }

        console.log('Tentando cadastrar novo usuário:', this.email);
        
        // Dispara o método atualizado no auth.ts passando o nome tratado
        await this.authService.cadastrarNovoUsuario(this.email, this.password, this.nome);
        
        this.sucessoMensagem = 'Cadastro realizado com sucesso! Faça login para entrar.';
        this.modoCadastro = false; // Joga o usuário de volta para a aba de Login
        this.password = '';
        this.nome = '';

      } else {
        // Fluxo padrão de autenticação/login
        console.log('Tentando logar com:', this.email);
        await this.authService.login(this.email, this.password);
        console.log('Login aceito! Redirecionando...');
        this.router.navigate(['/dashboard']);
      }
    } catch (err: any) {
      console.error('Erro capturado no bloco Catch:', err);
      this.erroMensagem = err.message || 'Erro ao processar a requisição.';
    }
  }

  async esqueciSenha() {
    if (!this.email.trim()) {
      Swal.fire({
        icon: 'warning',
        title: 'Campo Vazio',
        text: 'Por favor, digite o seu e-mail no campo antes de clicar em esqueci a senha.',
        background: '#16171d',
        color: '#fff',
        confirmButtonColor: '#4f46e5'
      });
      return;
    }

    try {
      await this.authService.enviarEmailRecuperacao(this.email.trim());
      Swal.fire({
        icon: 'success',
        title: 'E-mail de Recuperação Enviado',
        text: `🔄 E-mail de recuperação enviado com sucesso para ${this.email.trim()}! Verifique sua caixa de entrada ou spam.`,
        background: '#16171d',
        color: '#fff',
        confirmButtonColor: '#4f46e5'
      });
    } catch (err: any) {
      Swal.fire({
        icon: 'error',
        title: 'Erro ao Enviar E-mail de Recuperação',
        text: 'Erro ao enviar e-mail de recuperação: ' + err.message,
        background: '#16171d',
        color: '#fff',
        confirmButtonColor: '#4f46e5'
      });
    }
  }

  // Altera dinamicamente as telas entre Login e Registro
  alternarModo() {
    this.modoCadastro = !this.modoCadastro;
    this.erroMensagem = '';
    this.sucessoMensagem = '';
    this.nome = '';
    this.password = '';
  }
}