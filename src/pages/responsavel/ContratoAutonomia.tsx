import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FileText, Loader2, Save, Plus, X, Send, CheckCircle2, XCircle, MessageSquare, Clock, History, Pencil, Trash2, Copy, DollarSign } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { motion } from "framer-motion";
import { toast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { calcularIdade, getContratoDefaultsPorIdade } from "@/lib/contrato-defaults";

type ContratoVersao = {
  id: string;
  familia_id: string;
  crianca_id: string | null;
  versao: number;
  status: string;
  regras_ouro: string[];
  direitos: string[];
  consequencias_naturais: string[];
  limite_resgate_diario: number;
  resgate_imediato: boolean;
  usar_recompensas: boolean;
  usar_mesada: boolean;
  valor_mesada: number | null;
  descricao_alteracoes: string | null;
  criado_por: string;
  aprovado_por: string | null;
  data_aprovacao: string | null;
  data_vigencia: string | null;
  created_at: string;
  updated_at: string;
};

type ContratoRevisao = {
  id: string;
  familia_id: string;
  crianca_id: string | null;
  contrato_versao_id: string;
  solicitante_id: string;
  justificativa: string;
  status: string;
  resposta: string | null;
  respondido_por: string | null;
  created_at: string;
};

export default function ContratoAutonomia() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const [selectedChildId, setSelectedChildId] = useState<string>("");
  const [showEditor, setShowEditor] = useState(false);
  const [editingContratoId, setEditingContratoId] = useState<string | null>(null);
  const [regras, setRegras] = useState<string[]>([]);
  const [direitos, setDireitos] = useState<string[]>([]);
  const [consequencias, setConsequencias] = useState<string[]>([]);
  const [limiteResgate, setLimiteResgate] = useState("50");
  const [resgateImediato, setResgateImediato] = useState(true);
  const [usarRecompensas, setUsarRecompensas] = useState(true);
  const [usarMesada, setUsarMesada] = useState(false);
  const [valorMesada, setValorMesada] = useState("");
  const [descricaoAlteracoes, setDescricaoAlteracoes] = useState("");
  const [novaRegra, setNovaRegra] = useState("");
  const [novoDireito, setNovoDireito] = useState("");
  const [novaConsequencia, setNovaConsequencia] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  const [revisaoDialog, setRevisaoDialog] = useState<{ revisao: ContratoRevisao; aceitar: boolean } | null>(null);
  const [respostaRevisao, setRespostaRevisao] = useState("");

  // Replicar contrato
  const [showReplicar, setShowReplicar] = useState(false);
  const [replicarTargetId, setReplicarTargetId] = useState("");
  const [replicarSource, setReplicarSource] = useState<ContratoVersao | null>(null);

  // Membros
  const { data: membros, isLoading: loadingMembros } = useQuery({
    queryKey: ["membros-familia", profile?.familia_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, nome, tipo_perfil, data_nascimento")
        .eq("familia_id", profile!.familia_id);
      if (error) throw error;
      return data;
    },
    enabled: !!profile,
  });

  const criancas = membros?.filter(m => m.tipo_perfil === "crianca") ?? [];

  useEffect(() => {
    if (criancas.length > 0 && !selectedChildId) {
      setSelectedChildId(criancas[0].user_id);
    }
  }, [criancas, selectedChildId]);

  const getNome = (userId: string) => membros?.find(m => m.user_id === userId)?.nome ?? "Desconhecido";

  const familiaId = profile?.familia_id;

  // All contracts for the selected child (single query replaces 5 separate ones)
  const { data: allContratos, isLoading: loadingVigente } = useQuery({
    queryKey: ["contratos-crianca", familiaId, selectedChildId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contrato_versao")
        .select("*")
        .eq("familia_id", familiaId!)
        .eq("crianca_id", selectedChildId)
        .order("versao", { ascending: false });
      if (error) throw error;
      return data as ContratoVersao[];
    },
    enabled: !!familiaId && !!selectedChildId,
  });

  const contratoVigente = allContratos?.find(c => c.status === "vigente") ?? null;
  const contratoPendente = allContratos?.find(c => c.status === "pendente_aprovacao") ?? null;
  const contratoRascunho = allContratos?.find(c => c.status === "rascunho") ?? null;
  const contratoRejeitado = allContratos?.find(c => c.status === "rejeitado") ?? null;
  const historico = allContratos ?? [];

  // Revisões (per child)
  const { data: revisoes } = useQuery({
    queryKey: ["contrato-revisoes", familiaId, selectedChildId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contrato_revisao")
        .select("*")
        .eq("familia_id", familiaId!)
        .eq("crianca_id", selectedChildId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ContratoRevisao[];
    },
    enabled: !!familiaId && !!selectedChildId,
  });

  // Config atual (per child)
  const { data: config } = useQuery({
    queryKey: ["config-familia", familiaId, selectedChildId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("configuracao_familia")
        .select("*")
        .eq("familia_id", familiaId!)
        .eq("crianca_id", selectedChildId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!familiaId && !!selectedChildId,
  });

  const initEditor = (base?: ContratoVersao | null, editId?: string) => {
    const hasNoHistory = historico !== undefined && historico.length === 0;
    const isFirstContract = !base && hasNoHistory;
    
    let source: any;
    if (base) {
      source = base;
    } else if (isFirstContract) {
      const crianca = membros?.find(m => m.user_id === selectedChildId);
      const idade = calcularIdade(crianca?.data_nascimento);
      const defaults = getContratoDefaultsPorIdade(idade);
      source = {
        regras_ouro: defaults.regras_ouro,
        direitos: defaults.direitos,
        consequencias_naturais: defaults.consequencias_naturais,
        limite_resgate_diario: defaults.limite_resgate_diario,
        resgate_imediato: true,
        usar_recompensas: true,
        usar_mesada: false,
        valor_mesada: null,
        descricao_alteracoes: "",
      };
    } else {
      source = {
        regras_ouro: config?.regras_ouro ?? [],
        direitos: (config as any)?.direitos ?? [],
        consequencias_naturais: config?.consequencias_naturais ?? [],
        limite_resgate_diario: config?.limite_resgate_diario ?? 50,
        resgate_imediato: config?.resgate_imediato ?? true,
        usar_recompensas: (config as any)?.usar_recompensas ?? true,
        usar_mesada: (config as any)?.usar_mesada ?? false,
        valor_mesada: (config as any)?.valor_mesada ?? null,
        descricao_alteracoes: "",
      };
    }
    setRegras(source.regras_ouro ?? []);
    setDireitos((source as any).direitos ?? []);
    setConsequencias(source.consequencias_naturais ?? []);
    setLimiteResgate(String(source.limite_resgate_diario));
    setResgateImediato(source.resgate_imediato);
    setUsarRecompensas(source.usar_recompensas ?? true);
    setUsarMesada(source.usar_mesada ?? false);
    setValorMesada(source.valor_mesada ? String(source.valor_mesada) : "");
    setDescricaoAlteracoes(source.descricao_alteracoes ?? "");
    setEditingContratoId(editId ?? null);
    setShowEditor(true);
  };

  const nextVersion = (historico?.length ?? 0) + 1;
  const isFirstContract = !contratoVigente && (historico?.length ?? 0) === 0;

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["contratos-crianca", familiaId, selectedChildId] });
  };

  const enviarContrato = useMutation({
    mutationFn: async () => {
      if (!usarRecompensas && !usarMesada) throw new Error("Selecione ao menos um modelo de incentivo");
      if (usarMesada && (!valorMesada || parseFloat(valorMesada) <= 0)) throw new Error("Informe o valor da mesada");
      if (editingContratoId) {
        const { error } = await supabase
          .from("contrato_versao")
          .update({
            regras_ouro: regras,
            direitos,
            consequencias_naturais: consequencias,
            limite_resgate_diario: parseInt(limiteResgate) || 50,
            resgate_imediato: resgateImediato,
            usar_recompensas: usarRecompensas,
            usar_mesada: usarMesada,
            valor_mesada: usarMesada ? parseFloat(valorMesada) : null,
            descricao_alteracoes: descricaoAlteracoes || null,
            status: "rascunho",
          })
          .eq("id", editingContratoId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("contrato_versao").insert({
          familia_id: familiaId!,
          crianca_id: selectedChildId,
          versao: nextVersion,
          status: "pendente_aprovacao",
          regras_ouro: regras,
          direitos,
          consequencias_naturais: consequencias,
          limite_resgate_diario: parseInt(limiteResgate) || 50,
          resgate_imediato: resgateImediato,
          usar_recompensas: usarRecompensas,
          usar_mesada: usarMesada,
          valor_mesada: usarMesada ? parseFloat(valorMesada) : null,
          descricao_alteracoes: descricaoAlteracoes || null,
          criado_por: profile!.user_id,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      invalidateAll();
      toast({ title: editingContratoId ? "Contrato salvo como rascunho! 📝" : "Contrato enviado para assinatura! 📜" });
      setShowEditor(false);
      setEditingContratoId(null);
    },
    onError: (e: any) => toast({ title: e.message || "Erro ao salvar contrato", variant: "destructive" }),
  });

  const publicarRascunho = useMutation({
    mutationFn: async (contratoId: string) => {
      const { error } = await supabase
        .from("contrato_versao")
        .update({ status: "pendente_aprovacao" })
        .eq("id", contratoId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAll();
      toast({ title: "Contrato enviado para assinatura! 📜" });
    },
    onError: () => toast({ title: "Erro ao enviar", variant: "destructive" }),
  });

  const excluirContrato = useMutation({
    mutationFn: async (contratoId: string) => {
      const { error } = await supabase
        .from("contrato_versao")
        .delete()
        .eq("id", contratoId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAll();
      toast({ title: "Contrato excluído 🗑️" });
      setShowDeleteConfirm(null);
    },
    onError: () => toast({ title: "Erro ao excluir", variant: "destructive" }),
  });

  const responderRevisao = useMutation({
    mutationFn: async ({ revisaoId, aceitar, resposta }: { revisaoId: string; aceitar: boolean; resposta: string }) => {
      const { error } = await supabase
        .from("contrato_revisao")
        .update({
          status: aceitar ? "aceita" : "recusada",
          resposta,
          respondido_por: profile!.user_id,
        })
        .eq("id", revisaoId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contrato-revisoes", familiaId, selectedChildId] });
      toast({ title: "Resposta enviada! ✅" });
      setRevisaoDialog(null);
      setRespostaRevisao("");
    },
    onError: () => toast({ title: "Erro ao responder", variant: "destructive" }),
  });

  const statusLabel: Record<string, string> = {
    rascunho: "Rascunho",
    pendente_aprovacao: "Pendente de Assinatura",
    vigente: "Vigente",
    substituido: "Substituído",
    rejeitado: "Rejeitado",
  };

  const statusColor: Record<string, string> = {
    vigente: "bg-green-100 text-green-800",
    pendente_aprovacao: "bg-yellow-100 text-yellow-800",
    rejeitado: "bg-red-100 text-red-800",
    substituido: "bg-muted text-muted-foreground",
    rascunho: "bg-blue-100 text-blue-800",
  };

  const revisoesPendentes = revisoes?.filter(r => r.status === "pendente") ?? [];

  // Replicar contrato para outro filho
  const replicarContrato = useMutation({
    mutationFn: async () => {
      if (!replicarSource || !replicarTargetId) return;

      // Check if target child has pending contract
      const { data: existingPendente } = await supabase
        .from("contrato_versao")
        .select("id")
        .eq("familia_id", familiaId!)
        .eq("crianca_id", replicarTargetId)
        .in("status", ["pendente_aprovacao", "rascunho"])
        .limit(1)
        .maybeSingle();

      if (existingPendente) {
        const { error } = await supabase
          .from("contrato_versao")
          .update({
            regras_ouro: replicarSource.regras_ouro,
            direitos: (replicarSource as any).direitos ?? [],
            consequencias_naturais: replicarSource.consequencias_naturais,
            limite_resgate_diario: replicarSource.limite_resgate_diario,
            resgate_imediato: replicarSource.resgate_imediato,
            usar_recompensas: replicarSource.usar_recompensas,
            usar_mesada: replicarSource.usar_mesada,
            valor_mesada: replicarSource.valor_mesada,
            descricao_alteracoes: `Replicado do contrato de ${getNome(selectedChildId)}`,
            status: "pendente_aprovacao",
          })
          .eq("id", existingPendente.id);
        if (error) throw error;
      } else {
        const { data: targetHistory } = await supabase
          .from("contrato_versao")
          .select("versao")
          .eq("familia_id", familiaId!)
          .eq("crianca_id", replicarTargetId)
          .order("versao", { ascending: false })
          .limit(1);
        
        const nextVer = ((targetHistory?.[0]?.versao ?? 0) + 1);

        const { error } = await supabase.from("contrato_versao").insert({
          familia_id: familiaId!,
          crianca_id: replicarTargetId,
          versao: nextVer,
          status: "pendente_aprovacao",
          regras_ouro: replicarSource.regras_ouro,
          direitos: (replicarSource as any).direitos ?? [],
          consequencias_naturais: replicarSource.consequencias_naturais,
          limite_resgate_diario: replicarSource.limite_resgate_diario,
          resgate_imediato: replicarSource.resgate_imediato,
          usar_recompensas: replicarSource.usar_recompensas,
          usar_mesada: replicarSource.usar_mesada,
          valor_mesada: replicarSource.valor_mesada,
          descricao_alteracoes: `Replicado do contrato de ${getNome(selectedChildId)}`,
          criado_por: profile!.user_id,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contratos-crianca"] });
      queryClient.invalidateQueries({ queryKey: ["contratos-crianca", familiaId, replicarTargetId] });
      toast({ title: `Contrato replicado para ${getNome(replicarTargetId)}! 📋` });
      setShowReplicar(false);
      setReplicarTargetId("");
    },
    onError: () => toast({ title: "Erro ao replicar", variant: "destructive" }),
  });

  const renderContrato = (c: ContratoVersao) => (
    <Card className="border-2" key={c.id}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <CardTitle className="font-display text-lg">Versão {c.versao}</CardTitle>
          <Badge className={statusColor[c.status]}>{statusLabel[c.status]}</Badge>
        </div>
        <span className="text-xs text-muted-foreground">
          {format(new Date(c.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
        </span>
      </CardHeader>
      <CardContent className="space-y-4">
        {c.descricao_alteracoes && (
          <div className="rounded-lg bg-blue-50 p-3 text-sm">
            <p className="font-medium text-blue-900">📝 Alterações desta versão:</p>
            <p className="text-blue-800 mt-1">{c.descricao_alteracoes}</p>
          </div>
        )}

        {/* Modelo de Incentivo */}
        <div className="rounded-lg border p-3 space-y-2">
          <h4 className="font-semibold text-sm">💰 Modelo de Incentivo</h4>
          <div className="flex flex-wrap gap-2">
            {c.usar_recompensas && (
              <Badge variant="outline" className="gap-1">🪙 Recompensas</Badge>
            )}
            {c.usar_mesada && (
              <Badge variant="outline" className="gap-1">💵 Mesada — R$ {Number(c.valor_mesada ?? 0).toFixed(2)}</Badge>
            )}
          </div>
          {c.usar_mesada && (
            <p className="text-xs text-muted-foreground">O valor da mesada será proporcional ao % de deveres individuais cumpridos no mês.</p>
          )}
          {!c.usar_recompensas && (
            <p className="text-xs text-muted-foreground">As tarefas não serão utilizadas para este filho. Serão usados deveres e compromissos.</p>
          )}
        </div>

        <div>
          <h4 className="font-semibold text-sm mb-2">📋 Deveres</h4>
          {(c.regras_ouro?.length ?? 0) > 0 ? (
            <ul className="space-y-1">
              {c.regras_ouro.map((r, i) => (
                <li key={i} className="text-sm rounded-lg bg-muted p-2">{i + 1}. {r}</li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted-foreground">Nenhum dever definido</p>}
        </div>

        <div>
          <h4 className="font-semibold text-sm mb-2">📖 Direitos</h4>
          {((c as any).direitos?.length ?? 0) > 0 ? (
            <ul className="space-y-1">
              {(c as any).direitos.map((d: string, i: number) => (
                <li key={i} className="text-sm rounded-lg bg-muted p-2">{i + 1}. {d}</li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted-foreground">Nenhum direito definido</p>}
        </div>

        <div>
          <h4 className="font-semibold text-sm mb-2">⚡ Consequências pelo não cumprimento dos deveres</h4>
          {(c.consequencias_naturais?.length ?? 0) > 0 ? (
            <ul className="space-y-1">
              {c.consequencias_naturais.map((cn, i) => (
                <li key={i} className="text-sm rounded-lg bg-muted p-2">{i + 1}. {cn}</li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted-foreground">Nenhuma consequência definida</p>}
        </div>

        {c.usar_recompensas && (
          <div className="flex flex-wrap gap-4 text-sm">
            <div className="rounded-lg bg-muted p-2 px-3">
              <span className="text-muted-foreground">Limite diário: </span>
              <span className="font-semibold">{c.limite_resgate_diario} moedas</span>
            </div>
          </div>
        )}

        {c.data_vigencia && (
          <p className="text-xs text-muted-foreground">
            Vigente desde {format(new Date(c.data_vigencia), "dd/MM/yyyy HH:mm", { locale: ptBR })}
          </p>
        )}
      </CardContent>
    </Card>
  );

  if (loadingVigente || loadingMembros) {
    return (
      <AppLayout>
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6 max-w-3xl">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="font-display text-2xl font-bold md:text-3xl">Contrato de Autonomia 📜</h1>
          <p className="text-muted-foreground">Combinados que guiam a jornada da família</p>
        </motion.div>

        {/* Seletor de criança */}
        {criancas.length > 0 && (
          <div className="flex items-center gap-3">
            <Label className="text-sm font-medium whitespace-nowrap">Filho(a):</Label>
            <Select value={selectedChildId} onValueChange={setSelectedChildId}>
              <SelectTrigger className="w-full max-w-xs">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {criancas.map(c => (
                  <SelectItem key={c.user_id} value={c.user_id}>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-5 w-5">
                        <AvatarFallback className="text-[10px]">{c.nome.charAt(0).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      {c.nome}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {!selectedChildId ? (
          <Card className="border-2 border-dashed">
            <CardContent className="py-8 text-center">
              <p className="text-muted-foreground">Nenhuma criança cadastrada na família.</p>
            </CardContent>
          </Card>
        ) : (
          <>
            <Tabs defaultValue="vigente">
              <TabsList className="w-full grid grid-cols-3">
                <TabsTrigger value="vigente">Vigente</TabsTrigger>
                <TabsTrigger value="revisoes" className="relative">
                  Revisões
                  {revisoesPendentes.length > 0 && (
                    <Badge variant="destructive" className="ml-1 h-5 w-5 p-0 text-[10px] flex items-center justify-center">
                      {revisoesPendentes.length}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="historico">Histórico</TabsTrigger>
              </TabsList>

              <TabsContent value="vigente" className="space-y-4 mt-4">
                {contratoVigente ? (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                    {renderContrato(contratoVigente)}
                    {criancas.length > 1 && (
                      <Button
                        variant="outline"
                        className="w-full mt-3"
                        onClick={() => {
                          setReplicarSource(contratoVigente);
                          setReplicarTargetId("");
                          setShowReplicar(true);
                        }}
                      >
                        <Copy className="h-4 w-4 mr-2" /> Replicar para outro filho
                      </Button>
                    )}
                  </motion.div>
                ) : (
                  <Card className="border-2 border-dashed">
                    <CardContent className="py-8 text-center">
                      <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                      <p className="text-muted-foreground">Nenhum contrato vigente para {getNome(selectedChildId)}.</p>
                      <p className="text-sm text-muted-foreground mb-4">
                        {isFirstContract
                          ? "Crie o primeiro contrato para formalizar os combinados."
                          : "Nenhuma versão vigente no momento."}
                      </p>
                    </CardContent>
                  </Card>
                )}

                {!contratoPendente && !contratoRascunho && !(contratoRejeitado && contratoRejeitado.versao === (historico?.[0]?.versao ?? 0)) && (
                  <Button onClick={() => initEditor(contratoVigente)} className="w-full">
                    <Plus className="h-4 w-4 mr-2" />
                    {contratoVigente ? "Criar Nova Versão" : "Criar Primeiro Contrato"}
                  </Button>
                )}
              </TabsContent>

              <TabsContent value="revisoes" className="space-y-4 mt-4">
                {(revisoes?.length ?? 0) === 0 ? (
                  <Card className="border-2 border-dashed">
                    <CardContent className="py-8 text-center">
                      <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                      <p className="text-muted-foreground">Nenhuma solicitação de revisão.</p>
                    </CardContent>
                  </Card>
                ) : (
                  revisoes?.map(r => (
                    <Card key={r.id} className="border-2">
                      <CardContent className="py-4 space-y-2">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold">{getNome(r.solicitante_id)}</span>
                            <Badge className={r.status === "pendente" ? "bg-yellow-100 text-yellow-800" : r.status === "aceita" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}>
                              {r.status === "pendente" ? "Pendente" : r.status === "aceita" ? "Aceita" : "Recusada"}
                            </Badge>
                          </div>
                          <span className="text-xs text-muted-foreground">{format(new Date(r.created_at), "dd/MM/yyyy", { locale: ptBR })}</span>
                        </div>
                        <p className="text-sm bg-muted rounded-lg p-2">{r.justificativa}</p>
                        {r.resposta && (
                          <div className="text-sm bg-primary/5 rounded-lg p-2">
                            <span className="font-medium">Resposta:</span> {r.resposta}
                          </div>
                        )}
                        {r.status === "pendente" && (
                          <div className="flex gap-2 pt-1">
                            <Button size="sm" onClick={() => { setRevisaoDialog({ revisao: r, aceitar: true }); setRespostaRevisao(""); }}>
                              <CheckCircle2 className="h-3 w-3 mr-1" /> Aceitar
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => { setRevisaoDialog({ revisao: r, aceitar: false }); setRespostaRevisao(""); }}>
                              <XCircle className="h-3 w-3 mr-1" /> Recusar
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))
                )}
              </TabsContent>

              <TabsContent value="historico" className="space-y-4 mt-4">
                {(historico?.length ?? 0) === 0 ? (
                  <Card className="border-2 border-dashed">
                    <CardContent className="py-8 text-center">
                      <History className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                      <p className="text-muted-foreground">Nenhuma versão registrada.</p>
                    </CardContent>
                  </Card>
                ) : (
                  historico?.map(c => {
                    const isLatest = c.versao === (historico?.[0]?.versao ?? 0);
                    return (
                      <div key={c.id} className="space-y-3">
                        {renderContrato(c)}
                        {/* Ações para rascunho */}
                        {c.status === "rascunho" && (
                          <div className="flex gap-2">
                            <Button onClick={() => publicarRascunho.mutate(c.id)} disabled={publicarRascunho.isPending} className="flex-1">
                              {publicarRascunho.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="h-4 w-4 mr-1" /> Enviar para Assinatura</>}
                            </Button>
                            <Button variant="outline" onClick={() => initEditor(c, c.id)}>
                              <Pencil className="h-4 w-4 mr-1" /> Editar
                            </Button>
                            <Button variant="destructive" size="icon" onClick={() => setShowDeleteConfirm(c.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                        {/* Ações para pendente */}
                        {c.status === "pendente_aprovacao" && (
                          <div className="flex gap-2">
                            <Button variant="outline" onClick={() => initEditor(c, c.id)} className="flex-1">
                              <Pencil className="h-4 w-4 mr-1" /> Alterar (volta para rascunho)
                            </Button>
                            <Button variant="destructive" size="icon" onClick={() => setShowDeleteConfirm(c.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                        {/* Ações para rejeitado (só última versão) */}
                        {c.status === "rejeitado" && isLatest && (
                          <div className="flex gap-2">
                            <Button onClick={() => initEditor(c, c.id)} className="flex-1">
                              <Pencil className="h-4 w-4 mr-1" /> Ajustar e Reenviar
                            </Button>
                            <Button variant="destructive" size="icon" onClick={() => setShowDeleteConfirm(c.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </TabsContent>
            </Tabs>

            {/* EDITOR DE NOVA VERSÃO */}
            <Dialog open={showEditor} onOpenChange={setShowEditor}>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="font-display">
                    {editingContratoId ? "Editar Contrato" : isFirstContract ? `Primeiro Contrato de ${getNome(selectedChildId)}` : `Nova Versão do Contrato para ${getNome(selectedChildId)} (v${nextVersion})`}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  {!isFirstContract && (
                    <div>
                      <Label>📝 Descrição das alterações</Label>
                      <Textarea
                        placeholder="Explique o que mudou e por quê..."
                        value={descricaoAlteracoes}
                        onChange={e => setDescricaoAlteracoes(e.target.value)}
                        className="mt-1"
                      />
                    </div>
                  )}

                  {/* Modelo de Incentivo */}
                  <div className="rounded-lg border p-4 space-y-4">
                    <Label className="font-semibold text-base block">💰 Modelo de Incentivo</Label>
                    
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">🪙 Esquema de Recompensas</p>
                        <p className="text-xs text-muted-foreground">Moedas por tarefas, loja de recompensas</p>
                      </div>
                      <Switch checked={usarRecompensas} onCheckedChange={(v) => { if (!v && !usarMesada) return; setUsarRecompensas(v); }} />
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">💵 Esquema de Mesada</p>
                        <p className="text-xs text-muted-foreground">Valor mensal proporcional aos deveres cumpridos</p>
                      </div>
                      <Switch checked={usarMesada} onCheckedChange={(v) => { if (!v && !usarRecompensas) return; setUsarMesada(v); }} />
                    </div>

                    {usarMesada && (
                      <div>
                        <Label>Valor da mesada (R$)</Label>
                        <Input type="number" min="0" step="0.01" placeholder="Ex: 50.00" value={valorMesada} onChange={e => setValorMesada(e.target.value)} className="mt-1" />
                        <p className="text-xs text-muted-foreground mt-1"><p className="text-xs text-muted-foreground mt-1">O valor da mesada que a criança/adolescente irá receber será proporcional ao % de deveres individuais cumpridos no mês.</p></p>
                      </div>
                    )}

                    {!usarRecompensas && (
                      <div className="rounded-lg bg-yellow-50 p-3 text-sm text-yellow-800">
                        ⚠️ As tarefas não serão utilizadas para este filho. Serão usados deveres e compromissos. A loja de recompensas e o histórico de moedas ficarão inacessíveis.
                      </div>
                    )}

                    {!usarRecompensas && !usarMesada && (
                      <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                        Selecione ao menos um modelo de incentivo.
                      </div>
                    )}
                  </div>

                  {usarRecompensas && (
                    <div>
                      <Label>Limite de resgate diário (moedas)</Label>
                      <Input type="number" min="1" value={limiteResgate} onChange={e => setLimiteResgate(e.target.value)} className="mt-1" />
                    </div>
                  )}

                  <div>
                    <Label className="mb-2 block">📋 Deveres</Label>
                    {regras.map((r, i) => (
                      <div key={i} className="flex items-center gap-2 rounded-lg bg-muted p-1 mb-1">
                        <Input
                          value={r}
                          onChange={e => { const updated = [...regras]; updated[i] = e.target.value; setRegras(updated); }}
                          className="flex-1 text-sm border-0 bg-transparent h-8"
                        />
                        <Button size="sm" variant="ghost" onClick={() => setRegras(regras.filter((_, idx) => idx !== i))}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                    <div className="flex gap-2 mt-1">
                      <Input placeholder="Novo dever..." value={novaRegra} onChange={e => setNovaRegra(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && novaRegra.trim()) { setRegras([...regras, novaRegra.trim()]); setNovaRegra(""); } }} />
                      <Button size="sm" variant="outline" onClick={() => { if (novaRegra.trim()) { setRegras([...regras, novaRegra.trim()]); setNovaRegra(""); } }}>
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div>
                    <Label className="mb-2 block">📖 Direitos</Label>
                    {direitos.map((d, i) => (
                      <div key={i} className="flex items-center gap-2 rounded-lg bg-muted p-1 mb-1">
                        <Input
                          value={d}
                          onChange={e => { const updated = [...direitos]; updated[i] = e.target.value; setDireitos(updated); }}
                          className="flex-1 text-sm border-0 bg-transparent h-8"
                        />
                        <Button size="sm" variant="ghost" onClick={() => setDireitos(direitos.filter((_, idx) => idx !== i))}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                    <div className="flex gap-2 mt-1">
                      <Input placeholder="Novo direito..." value={novoDireito} onChange={e => setNovoDireito(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && novoDireito.trim()) { setDireitos([...direitos, novoDireito.trim()]); setNovoDireito(""); } }} />
                      <Button size="sm" variant="outline" onClick={() => { if (novoDireito.trim()) { setDireitos([...direitos, novoDireito.trim()]); setNovoDireito(""); } }}>
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div>
                    <Label className="mb-2 block">⚡ Consequências pelo não cumprimento dos deveres</Label>
                    {consequencias.map((c, i) => (
                      <div key={i} className="flex items-center gap-2 rounded-lg bg-muted p-1 mb-1">
                        <Input
                          value={c}
                          onChange={e => { const updated = [...consequencias]; updated[i] = e.target.value; setConsequencias(updated); }}
                          className="flex-1 text-sm border-0 bg-transparent h-8"
                        />
                        <Button size="sm" variant="ghost" onClick={() => setConsequencias(consequencias.filter((_, idx) => idx !== i))}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                    <div className="flex gap-2 mt-1">
                      <Input placeholder="Nova consequência..." value={novaConsequencia} onChange={e => setNovaConsequencia(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && novaConsequencia.trim()) { setConsequencias([...consequencias, novaConsequencia.trim()]); setNovaConsequencia(""); } }} />
                      <Button size="sm" variant="outline" onClick={() => { if (novaConsequencia.trim()) { setConsequencias([...consequencias, novaConsequencia.trim()]); setNovaConsequencia(""); } }}>
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowEditor(false)}>Cancelar</Button>
                  <Button onClick={() => enviarContrato.mutate()} disabled={enviarContrato.isPending}>
                    {enviarContrato.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : editingContratoId ? <><Save className="h-4 w-4 mr-1" /> Salvar como Rascunho</> : <><Send className="h-4 w-4 mr-1" /> Enviar para Assinatura</>}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* DIÁLOGO RESPONDER REVISÃO */}
            <Dialog open={!!revisaoDialog} onOpenChange={() => setRevisaoDialog(null)}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{revisaoDialog?.aceitar ? "Aceitar Revisão" : "Recusar Revisão"}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="bg-muted rounded-lg p-3 text-sm">
                    <p className="font-medium mb-1">Solicitação:</p>
                    <p>{revisaoDialog?.revisao.justificativa}</p>
                  </div>
                  <div>
                    <Label>Sua resposta</Label>
                    <Textarea
                      placeholder={revisaoDialog?.aceitar ? "Vamos revisar conforme sugerido..." : "Não vamos alterar porque..."}
                      value={respostaRevisao}
                      onChange={e => setRespostaRevisao(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setRevisaoDialog(null)}>Cancelar</Button>
                  <Button
                    onClick={() => revisaoDialog && responderRevisao.mutate({
                      revisaoId: revisaoDialog.revisao.id,
                      aceitar: revisaoDialog.aceitar,
                      resposta: respostaRevisao,
                    })}
                    disabled={responderRevisao.isPending || !respostaRevisao.trim()}
                  >
                    {responderRevisao.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* DIÁLOGO CONFIRMAR EXCLUSÃO */}
            <Dialog open={!!showDeleteConfirm} onOpenChange={() => setShowDeleteConfirm(null)}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Excluir Contrato</DialogTitle>
                </DialogHeader>
                <p className="text-sm text-muted-foreground">Tem certeza que deseja excluir este contrato? Esta ação não pode ser desfeita.</p>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowDeleteConfirm(null)}>Cancelar</Button>
                  <Button variant="destructive" onClick={() => showDeleteConfirm && excluirContrato.mutate(showDeleteConfirm)} disabled={excluirContrato.isPending}>
                    {excluirContrato.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Trash2 className="h-4 w-4 mr-1" /> Excluir</>}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* DIÁLOGO REPLICAR CONTRATO */}
            <Dialog open={showReplicar} onOpenChange={setShowReplicar}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Replicar Contrato 📋</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Selecione o filho(a) para quem deseja replicar o contrato vigente de {getNome(selectedChildId)}.
                  </p>
                  <Select value={replicarTargetId} onValueChange={setReplicarTargetId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o filho(a)" />
                    </SelectTrigger>
                    <SelectContent>
                      {criancas.filter(c => c.user_id !== selectedChildId).map(c => (
                        <SelectItem key={c.user_id} value={c.user_id}>
                          <div className="flex items-center gap-2">
                            <Avatar className="h-5 w-5">
                              <AvatarFallback className="text-[10px]">{c.nome.charAt(0).toUpperCase()}</AvatarFallback>
                            </Avatar>
                            {c.nome}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Se já houver um contrato pendente ou rascunho para o filho selecionado, os dados serão substituídos.
                  </p>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowReplicar(false)}>Cancelar</Button>
                  <Button
                    onClick={() => replicarContrato.mutate()}
                    disabled={replicarContrato.isPending || !replicarTargetId}
                  >
                    {replicarContrato.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Copy className="h-4 w-4 mr-1" /> Replicar</>}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        )}
      </div>
    </AppLayout>
  );
}
