import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase';
import { EMPTY } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class EquipamentosService { // 🟢 Nome mantido no plural conforme o VS Code indicou
  constructor(private supabase: SupabaseService) {}

  // [TODOS] Consultar o estoque completo atualizado
  async obterEstoque() {
    const { data, error } = await this.supabase.client
      .from('equipamentos')
      .select('id_equipamento, nome, status')
      .order('nome', { ascending: true });

    if (error) throw error;
    return data;
  }

  // [ADMIN] Cadastrar novo patrimônio externo
  async cadastrarEquipamento(idEquipamento: string, nome: string) {
    const { data, error } = await this.supabase.client
      .from('equipamentos')
      .insert({ id_equipamento: idEquipamento, nome: nome, status: 'Disponivel' });

    if (error) throw error;
    return data;
  }

  // Busca a lista de eventos únicos que possuem equipamentos com status 'Em Evento'
  async obterEventosAtivos(): Promise<string[]> {
    const { data, error } = await this.supabase.client
      .from('movimentacoes')
      .select('evento') // Substitua pelo nome exato da coluna que guarda o evento no seu estoque
      .is('data_devolucao', null) // Se a devolução é nula, o evento está ativo
      .neq('evento', 'RETORNO DE ASSISTÊNCIA TÉCNICA'); // 🟢 CORRIGIDO: Remove a assistência técnica da lista suspensa

    if (error) throw error;

    // Remove duplicados da lista de strings
    const eventos = data.map((m: any) => m.evento).filter((v: any) => v);
    return [...new Set(eventos)];
  }

  // 2. 🟢 NOVO: Busca quais patrimônios específicos estão na rua para o evento selecionado
  async obterEquipamentosPendentesPorEvento(nomeEvento: string) {
    const { data, error } = await this.supabase.client
      .from('movimentacoes')
      .select(`
        id_equipamento,
        equipamentos ( nome )
      `)
      .eq('evento', nomeEvento)
      .is('data_devolucao', null); // Apenas o que ainda não voltou

    if (error) throw error;

    // Formata o retorno para o padrão que o componente Angular já consome
    return data.map((mov: any) => ({
      id_equipamento: mov.id_equipamento,
      nome: mov.equipamentos?.nome || 'N/A'
    }));
  }

  // [TODOS] Registrar a Retirada em Massa para um Evento
  async registrarRetiradaEmMassa(idEquipamentos: string[], idUsuario: string, evento: string) {
    const eventoFormatado = evento.trim().toUpperCase();

    for (const id of idEquipamentos) {
      const { data: eq } = await this.supabase.client
        .from('equipamentos')
        .select('status')
        .eq('id_equipamento', id)
        .single();

      if (!eq) throw new Error(`Equipamento ${id} não encontrado.`);
      if (eq.status !== 'Disponivel') throw new Error(`O item ${id} não está disponível para retirada (Status: ${eq.status}).`);

      await this.supabase.client.from('movimentacoes').insert({
        id_usuario: idUsuario,
        id_equipamento: id,
        evento: eventoFormatado,
        data_retirada: new Date().toISOString()
      });

      await this.supabase.client
        .from('equipamentos')
        .update({ status: 'Em Evento' })
        .eq('id_equipamento', id);
    }
  }

  // [TODOS] Registrar a Devolução em Massa com Tratamento de Destino (Manutenção/Baixa)
  async registrarDevolucaoEmMassa(
    idEquipamentos: string[], 
    evento: string, 
    obs: string, 
    pediuManutencao: boolean, 
    pediuBaixa: boolean,
    ehAdmin: boolean,
    idUsuarioDevolucao: string | null
  ) {
    const obsFormatada = obs.trim().toUpperCase();

    let statusDestino = 'Disponivel';
    if (pediuBaixa) {
      statusDestino = ehAdmin ? 'Baixado' : 'Aguardando Baixa';
    } else if (pediuManutencao) {
      statusDestino = ehAdmin ? 'Manutencao' : 'Aguardando Manutencao';
    }

    for (const id of idEquipamentos) {
      const { data: mov } = await this.supabase.client
        .from('movimentacoes')
        .select('id_movimentacao')
        .eq('id_equipamento', id)
        .is('data_devolucao', null)
        .order('data_retirada', { ascending: false })
        .limit(1)
        .single();

      if (mov) {
        await this.supabase.client
          .from('movimentacoes')
          .update({
            data_devolucao: new Date().toISOString(),
            observacoes_devolucao: obsFormatada,
            solicitou_baixa: pediuBaixa,
            id_usuario_devolucao: idUsuarioDevolucao, // Quem devolveu
            status_retorno: statusDestino.toUpperCase() // Destino (DISPONIVEL, MANUTENCAO, etc)
          })
          .eq('id_movimentacao', mov.id_movimentacao);
      }

      await this.supabase.client
        .from('equipamentos')
        .update({ 
          status: statusDestino,
          motivo_baixa: pediuBaixa ? obsFormatada : null 
        })
        .eq('id_equipamento', id);
    }
  }

  // [ADMIN] Libera o item da manutenção e abre o rastro de entrada no estoque
  async finalizarManutencao(idEquipamento: string, idAdminLogado: string | null) {
    // 1. Volta o equipamento para Disponível no estoque geral
    await this.supabase.client
      .from('equipamentos')
      .update({ 
        status: 'Disponivel',
        motivo_baixa: null 
      })
      .eq('id_equipamento', idEquipamento);

    // 2. Insere a linha de rastro: O item "nasce" de volta no depósito pronto para uso
    await this.supabase.client
      .from('movimentacoes')
      .insert({
        id_equipamento: idEquipamento,
        id_usuario: idAdminLogado, // Admin que assinou a entrada
        evento: 'RETORNO DE ASSISTÊNCIA TÉCNICA',
        data_retirada: new Date().toISOString(), // Grava o dia e hora exata que voltou
        data_devolucao: null, // Fica nulo porque ele está fisicamente no depósito aguardando um evento real
        status_retorno: 'VOLTOU_DA_ASSISTENCIA',
        observacoes_devolucao: 'EQUIPAMENTO REATIVADO E DISPONÍVEL PARA RETIRADA'
      });
  }

  // [ADMIN] Enviar um equipamento do depósito direto para manutenção sem fluxo de evento
  async enviarManutencaoDiretoNoEstoque(idEquipamento: string, motivo: string) {
    const { data: eq } = await this.supabase.client
      .from('equipamentos')
      .select('status')
      .eq('id_equipamento', idEquipamento)
      .single();

    if (!eq) throw new Error('Equipamento não encontrado.');
    if (eq.status === 'Manutencao') throw new Error('Este equipamento já se encontra em manutenção.');
    if (eq.status === 'Baixado') throw new Error('Não é possível enviar um item baixado/inutilizado para a manutenção.');

    await this.supabase.client
      .from('equipamentos')
      .update({
        status: 'Manutencao',
        // Reaproveitamos a coluna de observações ou histórico se você tiver, ou apenas mudamos o status
        motivo_baixa: motivo.trim().toUpperCase() // Usando o mesmo campo de texto para guardar o defeito
      })
      .eq('id_equipamento', idEquipamento);
  }

  // [ADMIN] Forçar a baixa/descarte direto de um item pelo painel sem histórico de fluxo
  async baixarDiretoNoEstoque(idEquipamento: string, motivo: string) {
    const { data: eq } = await this.supabase.client
      .from('equipamentos')
      .select('status')
      .eq('id_equipamento', idEquipamento)
      .single();

    if (!eq) throw new Error('Equipamento não encontrado.');
    if (eq.status === 'Baixado') throw new Error('Este equipamento já se encontra baixado.');

    await this.supabase.client
      .from('equipamentos')
      .update({
        status: 'Baixado',
        motivo_baixa: motivo.trim().toUpperCase()
      })
      .eq('id_equipamento', idEquipamento);
  }

  // [ADMIN] Obter lista de equipamentos aguardando validação de Manutenção ou Baixa (Sem acentos)
  async obterPendenciasAprovacao() {
    const { data, error } = await this.supabase.client
      .from('equipamentos')
      .select('id_equipamento, nome, status, motivo_baixa')
      .in('status', ['Aguardando Manutencao', 'Aguardando Baixa'])
      .order('nome', { ascending: true });

    if (error) throw error;
    return data;
  }

  // [ADMIN] Decisão do Administrador sobre uma pendência (Aprovar ou Rejeitar)
  async decidirStatusPendencia(idEquipamento: string, aprovar: boolean, tipo: 'Manutencao' | 'Baixa') {
    let novoStatus = 'Disponivel';
    
    if (aprovar) {
      novoStatus = tipo === 'Manutencao' ? 'Manutencao' : 'Baixado';
    }

    await this.supabase.client
      .from('equipamentos')
      .update({ 
        status: novoStatus,
        motivo_baixa: novoStatus === 'Baixado' ? 'BAIXA APROVADA PELO ADM' : null
      })
      .eq('id_equipamento', idEquipamento);
  }

  // [ADMIN] Buscar Relatório Geral Consolidado Cruzando as tabelas
  async obterRelatorioGeral() {
    const { data, error } = await this.supabase.client
      .from('movimentacoes')
      .select(`
        id_movimentacao, 
        evento,
        data_retirada, 
        data_devolucao, 
        observacoes_devolucao,
        id_equipamento,
        equipamentos (nome),
        status_retorno,
        operador_retirada:id_usuario (nome),
        operador_devolucao: id_usuario_devolucao (nome)
      `) // 🟢 JOIN DUPLO: Renomeia os perfis para diferenciar as duas pessoas na resposta
      .order('data_retirada', { ascending: false });

    if (error){
      console.error('Erro ao obter relatório geral:', error);
      throw error;
    }
    
    console.log('Relatório Geral:', data);
    return data||[];
  }
}