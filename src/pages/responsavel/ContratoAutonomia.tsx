import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FileText, Loader2, Save, Plus, X, Send, CheckCircle2, XCircle, MessageSquare, Clock, History } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type ContratoVersao = {
  id: string;
  familia_id: string;
  versao: number;
  status: string;
  regras_ouro: string[];
  consequencias_naturais: string[];
  limite_resgate_diario: number;
  resgate_imediato: boolean;
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

  const [showEditor, setShowEditor] = useState(false);
  const [regras, setRegras] = useState<string[]>([]);
  const [consequencias, setConsequencias] = useState<string[]>([]);
  const [limiteResgate, setLimiteResgate] = useState("50");
  const [resgateImediato, setResgateImediato] = useState(true);
  const [descricaoAlteracoes, setDescricaoAlteracoes] = useState("");
  const [novaRegra, setNovaRegra] = useState("");
  const [novaConsequencia, setNovaConsequencia] = useState("");

  // Diálogo para responder revisão
  const [revisaoDialog, setRevisaoDialog] = useState<{ revisao: ContratoRevisao; aceitar: boolean } | null>(null);
  const [respostaRevisao, setRespostaRevisao] = useState("");

  // Membros para lookup de nomes
  const { data: membros } = useQuery({
    queryKey: ["membros-familia", profile?.familia_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, nome, tipo_perfil")
        .eq("familia_id", profile!.familia_id);
      if (error) throw error;
      return data;
    },
    enabled: !!profile,
  });

  const getNome = (userId: string) => membros?.find(m => m.user_id === userId)?.nome ?? "Desconhecido";

  // Contrato vigente
  const { data: contratoVigente, isLoading: loadingVigente } = useQuery({
    queryKey: ["contrato-vigente", profile?.familia_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contrato_versao")
        .select("*")
        .eq("familia_id", profile!.familia_id)
        .eq("status", "vigente")
        .order("versao", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as ContratoVersao | null;
    },
    enabled: !!profile,
  });

  // Contrato pendente de aprovação
  const { data: contratoPendente } = useQuery({
    queryKey: ["contrato-pendente", profile?.familia_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contrato_versao")
        .select("*")
        .eq("familia_id", profile!.familia_id)
        .eq("status", "pendente_aprovacao")
        .order("versao", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as ContratoVersao | null;
    },
    enabled: !!profile,
  });

  // Histórico de versões
  const { data: historico } = useQuery({
    queryKey: ["contrato-historico", profile?.familia_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contrato_versao")
        .select("*")
        .eq("familia_id", profile!.familia_id)
        .order("versao", { ascending: false });
      if (error) throw error;
      return data as ContratoVersao[];
    },
    enabled: !!profile,
  });

  // Revisões pendentes
  const { data: revisoes } = useQuery({
    queryKey: ["contrato-revisoes", profile?.familia_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contrato_revisao")
        .select("*")
        .eq("familia_id", profile!.familia_id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ContratoRevisao[];
    },
    enabled: !!profile,
  });

  // Config atual (para gerar primeiro contrato)
  const { data: config } = useQuery({
    queryKey: ["config-familia", profile?.familia_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("configuracao_familia")
        .select("*")
        .eq("familia_id", profile!.familia_id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!profile,
  });

  const initEditor = (base?: ContratoVersao | null) => {
    const source = base ?? {
      regras_ouro: config?.regras_ouro ?? [],
      consequencias_naturais: config?.consequencias_naturais ?? [],
      limite_resgate_diario: config?.limite_resgate_diario ?? 50,
      resgate_imediato: config?.resgate_imediato ?? true,
    };
    setRegras(source.regras_ouro ?? []);
    setConsequencias(source.consequencias_naturais ?? []);
    setLimiteResgate(String(source.limite_resgate_diario));
    setResgateImediato(source.resgate_imediato);
    setDescricaoAlteracoes("");
    setShowEditor(true);
  };

  const nextVersion = (historico?.length ?? 0) + 1;

  const enviarContrato = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("contrato_versao").insert({
        familia_id: profile!.familia_id,
        versao: nextVersion,
        status: "pendente_aprovacao",
        regras_ouro: regras,
        consequencias_naturais: consequencias,
        limite_resgate_diario: parseInt(limiteResgate) || 50,
        resgate_imediato: resgateImediato,
        descricao_alteracoes: descricaoAlteracoes || null,
        criado_por: profile!.user_id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contrato-pendente"] });
      queryClient.invalidateQueries({ queryKey: ["contrato-historico"] });
      toast({ title: "Contrato enviado para aprovação! 📜" });
      setShowEditor(false);
    },
    onError: () => toast({ title: "Erro ao enviar contrato", variant: "destructive" }),
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
      queryClient.invalidateQueries({ queryKey: ["contrato-revisoes"] });
      toast({ title: "Resposta enviada! ✅" });
      setRevisaoDialog(null);
      setRespostaRevisao("");
    },
    onError: () => toast({ title: "Erro ao responder", variant: "destructive" }),
  });

  const statusLabel: Record<string, string> = {
    rascunho: "Rascunho",
    pendente_aprovacao: "Pendente de Aprovação",
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

  const renderContrato = (c: ContratoVersao, showActions = false) => (
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

        <div>
          <h4 className="font-semibold text-sm mb-2">🏆 Regras de Ouro</h4>
          {(c.regras_ouro?.length ?? 0) > 0 ? (
            <ul className="space-y-1">
              {c.regras_ouro.map((r, i) => (
                <li key={i} className="text-sm rounded-lg bg-muted p-2">{i + 1}. {r}</li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted-foreground">Nenhuma regra definida</p>}
        </div>

        <div>
          <h4 className="font-semibold text-sm mb-2">⚡ Consequências Naturais</h4>
          {(c.consequencias_naturais?.length ?? 0) > 0 ? (
            <ul className="space-y-1">
              {c.consequencias_naturais.map((cn, i) => (
                <li key={i} className="text-sm rounded-lg bg-muted p-2">{i + 1}. {cn}</li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted-foreground">Nenhuma consequência definida</p>}
        </div>

        <div className="flex flex-wrap gap-4 text-sm">
          <div className="rounded-lg bg-muted p-2 px-3">
            <span className="text-muted-foreground">Limite diário: </span>
            <span className="font-semibold">{c.limite_resgate_diario} moedas</span>
          </div>
        </div>

        {c.data_vigencia && (
          <p className="text-xs text-muted-foreground">
            Vigente desde {format(new Date(c.data_vigencia), "dd/MM/yyyy HH:mm", { locale: ptBR })}
          </p>
        )}
      </CardContent>
    </Card>
  );

  if (loadingVigente) {
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

          {/* ABA VIGENTE */}
          <TabsContent value="vigente" className="space-y-4 mt-4">
            {contratoPendente && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <div className="rounded-lg border-2 border-yellow-400 bg-yellow-50 p-4 mb-4">
                  <p className="font-semibold text-yellow-800 flex items-center gap-2">
                    <Clock className="h-4 w-4" /> Versão {contratoPendente.versao} aguardando aprovação das crianças
                  </p>
                </div>
                {renderContrato(contratoPendente)}
              </motion.div>
            )}

            {contratoVigente ? (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                {renderContrato(contratoVigente)}
              </motion.div>
            ) : (
              <Card className="border-2 border-dashed">
                <CardContent className="py-8 text-center">
                  <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                  <p className="text-muted-foreground">Nenhum contrato vigente.</p>
                  <p className="text-sm text-muted-foreground mb-4">Crie o primeiro contrato para formalizar os combinados da família.</p>
                </CardContent>
              </Card>
            )}

            {!contratoPendente && (
              <Button onClick={() => initEditor(contratoVigente)} className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                {contratoVigente ? "Criar Nova Versão" : "Criar Primeiro Contrato"}
              </Button>
            )}
          </TabsContent>

          {/* ABA REVISÕES */}
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

          {/* ABA HISTÓRICO */}
          <TabsContent value="historico" className="space-y-4 mt-4">
            {(historico?.length ?? 0) === 0 ? (
              <Card className="border-2 border-dashed">
                <CardContent className="py-8 text-center">
                  <History className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                  <p className="text-muted-foreground">Nenhuma versão registrada.</p>
                </CardContent>
              </Card>
            ) : (
              historico?.map(c => renderContrato(c))
            )}
          </TabsContent>
        </Tabs>

        {/* EDITOR DE NOVA VERSÃO */}
        <Dialog open={showEditor} onOpenChange={setShowEditor}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-display">Nova Versão do Contrato (v{nextVersion})</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>📝 Descrição das alterações</Label>
                <Textarea
                  placeholder="Explique o que mudou e por quê..."
                  value={descricaoAlteracoes}
                  onChange={e => setDescricaoAlteracoes(e.target.value)}
                  className="mt-1"
                />
              </div>

              <div>
                <Label>Limite de resgate diário (moedas)</Label>
                <Input type="number" min="1" value={limiteResgate} onChange={e => setLimiteResgate(e.target.value)} className="mt-1" />
              </div>

              <div>
                <Label className="mb-2 block">🏆 Regras de Ouro</Label>
                {regras.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg bg-muted p-2 mb-1">
                    <span className="flex-1 text-sm">{r}</span>
                    <Button size="sm" variant="ghost" onClick={() => setRegras(regras.filter((_, idx) => idx !== i))}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
                <div className="flex gap-2 mt-1">
                  <Input placeholder="Nova regra..." value={novaRegra} onChange={e => setNovaRegra(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && novaRegra.trim()) { setRegras([...regras, novaRegra.trim()]); setNovaRegra(""); } }} />
                  <Button size="sm" variant="outline" onClick={() => { if (novaRegra.trim()) { setRegras([...regras, novaRegra.trim()]); setNovaRegra(""); } }}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div>
                <Label className="mb-2 block">⚡ Consequências Naturais</Label>
                {consequencias.map((c, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg bg-muted p-2 mb-1">
                    <span className="flex-1 text-sm">{c}</span>
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
                {enviarContrato.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="h-4 w-4 mr-1" /> Enviar para Aprovação</>}
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
      </div>
    </AppLayout>
  );
}
