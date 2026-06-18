import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth';
import { EquipamentosService } from '../../services/equipamentos';
import { Router } from '@angular/router';
import Swal from 'sweetalert2';
import { ZXingScannerModule } from '@zxing/ngx-scanner';
import { BarcodeFormat } from '@zxing/library';
import JsBarcode from 'jsbarcode';


@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, ZXingScannerModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit {
  @ViewChild('etiquetaMografica', { static: false }) etiquetaMografica!: ElementRef;

  // Controle de Abas: 'retirada' | 'devolucao' | 'estoque'
  abaAtiva: string = 'retirada';

  // Dados do Usuário Logado
  idUsuarioLogado: string | null = '';
  nomeUsuarioLogado = '';

  // Cesta de Equipamentos (Operação em Massa)
  cestaItens: { id_equipamento: string, nome: string }[] = [];
  codigoInput = '';
  eventoInput = '';
  observacaoInput = '';
  pediuManutencao = false;
  pediuBaixa = false;
  mostrarCamera = false;

  // Painel Administrativo (Cadastro e Baixa Direta)
  novoCodigo = '';
  novoNome = '';
  exibirEtiqueta = false;
  codigoBaixaDireta = '';
  motivoBaixaDireta = '';

  // Variável para reimpressão de etiquetas existentes
  codigoReimpressaoEtiqueta = '';

  // Listas de Dados do Banco
  listaEventosAtivos: string[] = [];
  estoqueGeral: any[] = [];
  relatorioMovimentacoes: any[] = [];
  pendenciasAprovacao: any[] = [];

  // Termo de pesquisa para a busca de estoque
  termoBuscaEstoque = '';

  // Guarda o dispositivo de câmera traseira selecionado para o scanner
  public cameraSelecionada: MediaDeviceInfo | undefined;
  // Controle manual de lentes
  public listaLentesTraseiras: MediaDeviceInfo[] = [];
  
  public formatosAceitos = [
    BarcodeFormat.CODE_128,
    BarcodeFormat.CODE_39,
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8
  ];

  // 🟢 NOVO: Armazena apenas os equipamentos que realmente saíram para o evento selecionado
  public listaEquipamentosPendentesDoEvento: { id_equipamento: string; nome: string; }[] = [];
  
  public imprimindoTabela: boolean = false;
  
  public ultimaRetiradaImpressao: {
    evento: string;
    data: string;
    operador: string;
    itens: { 
      id_equipamento: string; 
      nome: string;
      data_retirada: string;
      operador_item: string;
    }[];      
  } | null = null;
  
  public imprimindoRecibo: boolean = false;

  constructor(
    public authService: AuthService,
    private equipamentosService: EquipamentosService,
    private router: Router,
  ) {}

  async ngOnInit() {
    try { 
      this.idUsuarioLogado = await this.authService.ObterUsuarioId();
      this.nomeUsuarioLogado = this.authService.obterNomeUsuario(); 

      if (!this.idUsuarioLogado) {
        console.warn("Usuário não autenticado ou token inválido. Redirecionando...");
        this.router.navigate(['/login']);
        return;
      }

      this.carregarDadosEstoque();
      this.carregarRelatoriosAdmin();

      if (this.authService.seEhAdmin()) {
        await this.verificarAlertasPendencias();
      }
    } catch (err: any) {
      console.error("Erro crítico na inicialização do painel:", err);
      this.router.navigate(['/login']);
    }
  }

  async carregarFiltroEventos() {
    try {
      this.listaEventosAtivos = await this.equipamentosService.obterEventosAtivos();
    } catch (err) {
      console.error('Erro ao buscar eventos ativos:', err);
    }
  }

  async verificarAlertasPendencias() {
    try {
      this.pendenciasAprovacao = await this.equipamentosService.obterPendenciasAprovacao();
      if (this.pendenciasAprovacao.length > 0) {
        Swal.fire({
          toast: true,
          position: 'top-end',
          icon: 'warning',
          title: 'Alerta Administrativo',
          text: `🔔 Existem ${this.pendenciasAprovacao.length} equipamentos aguardando sua validação de manutenção ou baixa no depósito!`,
          showConfirmButton: false,
          timer: 4000,
          timerProgressBar: true,
          background: '#1d1f27',
          color: '#fff'
        });
      }
    } catch (err) {
      console.error('Erro ao verificar alertas iniciais:', err);
    }
  }

  async carregarDadosEstoque() {
    try {
      this.estoqueGeral = await this.equipamentosService.obterEstoque();
    } catch (err: any) {
      console.error('Erro ao buscar estoque:', err);
    }
  }

  async carregarRelatoriosAdmin() {
    try {
      this.relatorioMovimentacoes = await this.equipamentosService.obterRelatorioGeral();
      this.pendenciasAprovacao = await this.equipamentosService.obterPendenciasAprovacao();
    } catch (err) {
      console.error('Erro ao carregar relatórios gerenciais:', err);
    }
  }

  imprimirTabela(){
    if (this.relatorioMovimentacoes.length === 0) {
      Swal.fire({
        icon: 'info',
        title: 'Nada para Imprimir',
        text: 'Não há movimentações para imprimir!',
        background: '#16171d',
        color: '#fff',
        confirmButtonColor: '#4f46e5'
      });
      return;
    }
    
    this.imprimindoTabela = true;

    // 🟢 Injeta a classe global no BODY para forçar a rotação em Paisagem via styles.scss
    document.body.classList.add('imprimindo-tabela-larga');

    setTimeout(() => {
      window.print();
      this.imprimindoTabela = false;
      document.body.classList.remove('imprimindo-tabela-larga');
    }, 350);
  }
  
  exportarCSV() {
    if (this.relatorioMovimentacoes.length === 0) {
      Swal.fire({
        icon: 'info',
        title: 'Nada para Exportar',
        text: 'Não há movimentações para exportar!',
        background: '#16171d',
        color: '#fff',
        confirmButtonColor: '#4f46e5'
      });
      return;
    }

    const cabecalho = ['Quem Retirou', 'Quem Devolveu', 'Evento Vinculado', 'Equipamento', 'Patrimonio', 'Data Retirada', 'Data Devolucao', 'Status Retorno', 'Observacao Retorno'];
    const lines = this.relatorioMovimentacoes.map(mov => {
      const dataRetirada = mov.data_retirada ? new Date(mov.data_retirada).toLocaleString('pt-BR') : '';
      const dataDevolucao = mov.data_devolucao ? new Date(mov.data_devolucao).toLocaleString('pt-BR') : 'EM EVENTO';
      return [
        mov.operador_retirada?.nome || 'N/A', 
        mov.operador_devolucao?.nome || '-',   
        mov.evento || 'S/E',
        mov.equipamentos?.nome || 'N/A',
        `"${mov.id_equipamento}"`,
        dataRetirada,
        dataDevolucao,
        mov.status_retorno || 'EM EVENTO', 
        mov.observacoes_devolucao || '-'
      ];
    });

    const conteudoCSV = [
      cabecalho.join(';'),
      ...lines.map(linha => linha.join(';'))
    ].join('\n');

    const blob = new Blob(['\uFEFF' + conteudoCSV], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;

    const dataHoje = new Date().toISOString().split('T')[0];
    link.setAttribute('download', `Relatorio_Movimentacoes_${dataHoje}.csv`);

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  get estoqueFiltrado() {
    return this.estoqueGeral.filter(item => 
      item.nome.toLowerCase().includes(this.termoBuscaEstoque.toLowerCase()) ||
      item.id_equipamento.toLowerCase().includes(this.termoBuscaEstoque.toLowerCase()) ||
      item.status.toLowerCase().includes(this.termoBuscaEstoque.toLowerCase())
    );
  }

  mudarAba(aba: string) {
    this.abaAtiva = aba;
    this.limparCesta();
    if(aba === 'devolucao') this.carregarFiltroEventos();
  }

  adicionarNaCesta() {
    if (!this.codigoInput) return;
    const codigoClean = this.codigoInput.trim().toUpperCase();

    if (this.cestaItens.some(item => item.id_equipamento === codigoClean)) {
      Swal.fire({
        icon: 'info',
        title: 'Equipamento já adicionado',
        text: 'Este equipamento já está adicionado na lista atual!',
        background: '#16171d',
        color: '#fff',
        confirmButtonColor: '#4f46e5'
      });
      this.codigoInput = '';
      return;
    }

    const equipamentoEncontrado = this.estoqueGeral.find(
      eq => eq.id_equipamento.toUpperCase() === codigoClean
    );

    if (!equipamentoEncontrado) {
      Swal.fire({
        icon: 'error',
        title: 'Equipamento não encontrado',
        text: `❌ Atenção: O código "${codigoClean}" não foi encontrado no estoque geral cadastrado!`,
        background: '#16171d',
        color: '#fff',
        confirmButtonColor: '#4f46e5'
      });
      this.codigoInput = '';
      return;
    }

    this.cestaItens.push({
      id_equipamento: equipamentoEncontrado.id_equipamento,
      nome: equipamentoEncontrado.nome
    });
    this.codigoInput = '';
  }

  removerDaCesta(index: number) {
    this.cestaItens.splice(index, 1);
  }

  mapearLentesDisponiveis(dispositivos: MediaDeviceInfo[]) {
    if (!dispositivos || dispositivos.length === 0) return;

    this.listaLentesTraseiras = dispositivos.filter(device => 
      device.label.toLowerCase().includes('back') || 
      device.label.toLowerCase().includes('traseira') ||
      device.label.toLowerCase().includes('rear') ||
      device.label.toLowerCase().includes('0')
    );

    if (this.listaLentesTraseiras.length === 0) {
      this.listaLentesTraseiras = dispositivos;
    }

    if (!this.cameraSelecionada && this.listaLentesTraseiras.length > 0) {
      this.cameraSelecionada = this.listaLentesTraseiras[0];
    }
  }

  alterarLenteManual(event: Event) {
    const selectElement = event.target as HTMLSelectElement;
    const deviceId = selectElement.value;
    
    const lenteAchada = this.listaLentesTraseiras.find(cam => cam.deviceId === deviceId);
    if (lenteAchada) {
      this.cameraSelecionada = lenteAchada;
    }
  }
  
  aoScannearCodigo(resultado: string) {
    if (resultado) {
      this.codigoInput = resultado.trim().toUpperCase();
      this.mostrarCamera = false;
      this.adicionarNaCesta();
    }
  }

  // 🟢 NOVO: Monitora a mudança do evento e traz os itens certos do banco
  async aoMudarEventoDevolucao() {
    if (!this.eventoInput) {
      this.listaEquipamentosPendentesDoEvento = [];
      return;
    }
    try {
      this.listaEquipamentosPendentesDoEvento = await this.equipamentosService.obterEquipamentosPendentesPorEvento(this.eventoInput);
      this.cestaItens = []; // Limpa a cesta para não misturar eventos
    } catch (err) {
      console.error('Erro ao carregar equipamentos do evento:', err);
    }
  }

  // Ajuste na função de adicionar na cesta para validar o select ou o bip
  adicionarEquipamentoNaDevolucao(equipamentoSelecionado: any) {
    if (!equipamentoSelecionado) return;

    if (this.cestaItens.some(item => item.id_equipamento === equipamentoSelecionado.id_equipamento)) {
      Swal.fire({
        icon: 'info',
        title: 'Já adicionado',
        text: 'Este equipamento já está na cesta de retorno.',
        background: '#16171d',
        color: '#fff'
      });
      return;
    }

    this.cestaItens.push({
      id_equipamento: equipamentoSelecionado.id_equipamento,
      nome: equipamentoSelecionado.nome
    });
  }

  async confirmarRetiradaEmMassa() {
    if (this.cestaItens.length === 0) {
      alert('Sua lista de equipamentos está vazia! Bipe algum item.');
      return;
    }
    
    if (!this.eventoInput) {
      alert('Por favor, digite ou selecione o nome do Evento.');
      return;
    }

    if (!this.idUsuarioLogado) {
      alert('Sessão inválida. Por favor, refaça o login.');
      this.router.navigate(['/login']);
      return;
    }

    const idsParaEnviar = this.cestaItens.map(item => item.id_equipamento);

    try {
      await this.equipamentosService.registrarRetiradaEmMassa(idsParaEnviar, this.idUsuarioLogado, this.eventoInput);
      alert('🚀 Retirada em lote registrada com sucesso!');
      this.limparCesta();
      this.carregarDadosEstoque();
      this.carregarFiltroEventos();
      if (this.authService.seEhAdmin()) this.carregarRelatoriosAdmin();
    } catch (err: any) {
      alert('Erro ao processar retirada: ' + (err.message || err));
    }
  }

  async confirmarDevolucaoEmMassa() {
    if (this.cestaItens.length === 0) {
      alert('Sua lista de devolução está vazia! Bipe algum item.');
      return;
    }

    if (!this.eventoInput) {
      alert('Por favor, selecione o Evento de Origem.');
      return;
    }

    const ehAdmin = this.authService.seEhAdmin();

    if (this.pediuBaixa && ehAdmin) {
      const confirmou = confirm('🚨 ATENÇÃO: Você está logado como ADMINISTRADOR. Confirmar esta devolução com a opção de Baixa activa irá DESCARTAR estes equipamentos permanentemente. Deseja prosseguir?');
      if (!confirmou) return;
    }

    const idsParaEnviar = this.cestaItens.map(item => item.id_equipamento);

    try {
      await this.equipamentosService.registrarDevolucaoEmMassa(
        idsParaEnviar,
        this.eventoInput,
        this.observacaoInput,
        this.pediuManutencao,
        this.pediuBaixa,
        ehAdmin,
        this.idUsuarioLogado
      );

      if (ehAdmin && this.pediuBaixa) {
        alert('✅ Devolução com Baixa Definitiva realizada com sucesso.');
      } else if (!ehAdmin && (this.pediuBaixa || this.pediuManutencao)) {
        alert('ℹ️ Devolução registrada! Os itens foram enviados para a fila de homologação do Administrador.');
      } else {
        alert('✅ Todos os equipamentos foram devolvidos e reativados no estoque!');
      }

      this.limparCesta();
      this.carregarDadosEstoque();
      this.carregarFiltroEventos();
      if (ehAdmin) this.carregarRelatoriosAdmin();
    } catch (err: any) {
      alert('Erro ao registrar devolução: ' + (err.message || err));
    }
  }

  imprimirRetiradaHistorica(movimentoClicado: any) {
    if (!movimentoClicado || !movimentoClicado.evento) return;

    const eventoAlvo = movimentoClicado.evento;
    const itensDoLote = this.relatorioMovimentacoes.filter(mov => mov.evento === eventoAlvo);

    this.ultimaRetiradaImpressao = {
      evento: eventoAlvo.toUpperCase(),
      data: new Date(movimentoClicado.data_retirada).toLocaleString('pt-BR'),
      operador: movimentoClicado.operador_retirada?.nome || 'OPERADOR',
      itens: itensDoLote.map(mov => ({
        id_equipamento: mov.id_equipamento,
        nome: mov.equipamentos?.nome || 'N/A',
        data_retirada: mov.data_retirada, 
        operador_item: mov.operador_retirada?.nome || 'N/A' 
      }))
    };

    this.imprimindoRecibo = true;
    this.imprimindoTabela = false;

    setTimeout(() => {
      window.print();
      this.imprimindoRecibo = false;
      this.ultimaRetiradaImpressao = null;
    }, 300);
  }

  async concluirManutencao(id: string) {
    const confirmou = await Swal.fire({
      title: 'Concluir Manutenção? 🛠️',
      text: `Deseja retornar o equipamento ${id} para o status Disponível?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sim, Retornar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#10b981', 
      cancelButtonColor: '#1d1f27',
      background: '#16171d',
      color: '#fff'
    });

    if (confirmou.isConfirmed) {
      try {
        await this.equipamentosService.finalizarManutencao(id, this.idUsuarioLogado);
        
        this.estoqueGeral = this.estoqueGeral.map(item => {
          if (item.id_equipamento === id) {
            return { ...item, status: 'Disponivel' };
          }
          return item;
        });

        Swal.fire({
          icon: 'success',
          title: 'Item Reativado!',
          text: `O equipamento ${id} foi retirado da manutenção e já consta como Disponível no estoque geral para novos eventos.`,
          background: '#16171d',
          color: '#fff',
          confirmButtonColor: '#4f46e5'
        });

        this.carregarDadosEstoque();
        if (this.authService.seEhAdmin()) this.carregarRelatoriosAdmin();
      } catch (err: any) {
        Swal.fire({
          icon: 'error',
          title: 'Erro ao Reativar',
          text: err.message,
          background: '#16171d',
          color: '#fff'
        });
      }
    }
  }

  async processarDecisaoPendencia(id: string, aprovar: boolean, statusAtual: string) {
    const tipo = statusAtual === 'Aguardando Baixa' ? 'Baixa' : 'Manutencao';
    const acaoTexto = aprovar ? 'APROVAR' : 'REJEITAR';

    if (!confirm(`Deseja realmente ${acaoTexto} a solicitação de ${tipo} do equipamento ${id}?`)) return;

    try {
      await this.equipamentosService.decidirStatusPendencia(id, aprovar, tipo);
      Swal.fire({
        icon: 'success',
        title: 'Decisão Homologada',
        text: 'Decisão homologada com sucesso!',
        background: '#16171d',
        color: '#fff',
        confirmButtonColor: '#4f46e5'
      });
      this.carregarDadosEstoque();
      this.carregarRelatoriosAdmin();
    } catch (err: any) {
      Swal.fire({
        icon: 'error',
        title: 'Erro ao Processar Decisão',
        text: 'Erro ao processar decisão: ' + err.message,
        background: '#16171d',
        color: '#fff',
        confirmButtonColor: '#4f46e5'
      });
    }
  }

  async processarBaixaDireta() {
    if (!this.codigoBaixaDireta || !this.motivoBaixaDireta) {
      Swal.fire({
        icon: 'warning',
        title: 'Campos Incompletos',
        text: 'Informe o código de barras e o motivo real do descarte.',
        background: '#16171d',
        color: '#fff',
        confirmButtonColor: '#4f46e5'
      });
      return;
    }

    if (!confirm('🚨 SEGURANÇA MÁXIMA: Tem certeza absoluta de que deseja dar BAIXA DIRETA e inutilizar este patrimônio? Esta ação é definitiva.')) return;

    try {
      await this.equipamentosService.baixarDiretoNoEstoque(this.codigoBaixaDireta, this.motivoBaixaDireta);
      Swal.fire({
        icon: 'success',
        title: 'Baixa Direta Realizada',
        text: 'Patrimônio descartado com sucesso.',
        background: '#16171d',
        color: '#fff',
        confirmButtonColor: '#4f46e5'
      });
      this.codigoBaixaDireta = '';
      this.motivoBaixaDireta = '';
      this.carregarDadosEstoque();
      this.carregarRelatoriosAdmin();
    } catch (err: any) {
      Swal.fire({
        icon: 'error',
        title: 'Erro ao Processar Baixa Direta',
        text: 'Erro ao processar baixa direta: ' + err.message,
        background: '#16171d',
        color: '#fff',
        confirmButtonColor: '#4f46e5'
      });
    }
  }

  async cadastrarNovo() {
    if (!this.novoCodigo || !this.novoNome) {
      Swal.fire({
        icon: 'warning',
        title: 'Campos Incompletos',
        text: 'Preencha todos os campos!',
        background: '#16171d',
        color: '#fff',
        confirmButtonColor: '#4f46e5'
      });
      return;
    }

    try {
      const cod = this.novoCodigo.trim().toUpperCase();
      const nome = this.novoNome.trim().toUpperCase();

      await this.equipamentosService.cadastrarEquipamento(cod, nome);
      Swal.fire({
        icon: 'success',
        title: 'Cadastrado com Sucesso',
        text: 'Equipamento inserido com sucesso!',
        background: '#16171d',
        color: '#fff',
        confirmButtonColor: '#4f46e5'
      });

      this.exibirEtiqueta = true;

      setTimeout(() => {
        if (this.etiquetaMografica && this.etiquetaMografica.nativeElement) {
          JsBarcode(this.etiquetaMografica.nativeElement, cod, {
            format: "CODE128",
            lineColor: "#000000",
            background: "#ffffff",
            width: 3,
            height: 70,
            displayValue: true
          });
        }
      }, 60);

      this.novoCodigo = '';
      this.novoNome = '';
      this.carregarDadosEstoque();
    } catch (err: any) {
      Swal.fire({
        icon: 'error',
        title: 'Erro ao Cadastrar Equipamento',
        text: 'Erro ao cadastrar equipamento: ' + err.message,
        background: '#16171d',
        color: '#fff',
        confirmButtonColor: '#4f46e5'
      });
    }
  }

  async processarManutencaoDireta() {
    if (!this.codigoBaixaDireta || !this.motivoBaixaDireta) {
      alert('Por favor, informe o código de barras e o motivo/defeito do equipamento.');
      return;
    }

    if (!confirm(`Deseja realmente retirar o equipamento ${this.codigoBaixaDireta} do estoque ativo e enviá-lo para MANUTENÇÃO IMEDIATA?`)) return;

    try {
      await this.equipamentosService.enviarManutencaoDiretoNoEstoque(this.codigoBaixaDireta, this.motivoBaixaDireta);
      alert('🔧 Equipamento enviado para a manutenção com sucesso!');
      this.codigoBaixaDireta = '';
      this.motivoBaixaDireta = '';
      this.carregarDadosEstoque();
      this.carregarRelatoriosAdmin();
    } catch (err: any) {
      alert('Erro ao processar manutenção direta: ' + (err.message || err));
    }
  }

  async emitirEtiquetaItemExistente() {
    if (!this.codigoReimpressaoEtiqueta) {
      alert('Por favor, informe ou bipe o código do equipamento.');
      return;
    }

    const codClean = this.codigoReimpressaoEtiqueta.trim().toUpperCase();
    const itemExiste = this.estoqueGeral.some(eq => eq.id_equipamento.toUpperCase() === codClean);

    if (!itemExiste) {
      alert(`⚠️ Código "${codClean}" não foi encontrado no estoque. Cadastre-o primeiro.`);
      return;
    }

    this.exibirEtiqueta = true;

    setTimeout(() => {
      if (this.etiquetaMografica && this.etiquetaMografica.nativeElement) {
        JsBarcode(this.etiquetaMografica.nativeElement, codClean, {
          format: "CODE128",
          lineColor: "#000000",
          background: "#ffffff",
          width: 3,
          height: 70,
          displayValue: true
        });
      }
    }, 60);

    this.codigoReimpressaoEtiqueta = '';
  }

  baixarEtiqueta() {
    if (!this.etiquetaMografica || !this.etiquetaMografica.nativeElement) return;
    const link = document.createElement('a');
    link.href = this.etiquetaMografica.nativeElement.src;
    link.download = `ETIQUETA_${Date.now()}.png`;
    link.click();
  }

  limparCesta() {
    this.cestaItens = [];
    this.codigoInput = '';
    this.eventoInput = '';
    this.observacaoInput = '';
    this.pediuManutencao = false;
    this.pediuBaixa = false;
  }

  async fazerLogout() {
    try {
      await this.authService.logout();
      this.router.navigate(['/login']);
    } catch (err: any) {
      Swal.fire({
        icon: 'error',
        title: 'Erro ao Sair',
        text: 'Erro ao sair: ' + err.message,
        background: '#16171d',
        color: '#fff',
        confirmButtonColor: '#4f46e5'
      });
    }
  }
}