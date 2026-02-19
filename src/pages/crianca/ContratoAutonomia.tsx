import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FileText, Loader2, CheckCircle2, XCircle, MessageSquare, Clock, Send, Eye } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "@/hooks/use-toast";
import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

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
  descricao_alteracoes: string | null;
  criado_por: string;
  aprovado_por: string | null;
  data_aprovacao: string | null;
  data_vigencia: string | null;
  created_at: string;
};

type ContratoRevisao = {
  id: string;
  justificativa: string;
  status: string;
  resposta: string | null;
  created_at: string;
};

const toRoman = (n: number): string => {
  const numerals = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"],
    [100, "C"], [90, "XC"], [50, "L"], [40, "XL"],
    [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ] as const;
  let result = "";
  let remaining = n;
  for (const [value, numeral] of numerals) {
    while (remaining >= value) { result += numeral; remaining -= value; }
  }
  return result;
};

export default function ContratoAutonomiaCrianca() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const [showRevisao, setShowRevisao] = useState(false);
  const [justificativa, setJustificativa] = useState("");
  const [showRejeitar, setShowRejeitar] = useState(false);
  const [justificativaRejeicao, setJustificativaRejeicao] = useState("");
  const [viewingRejected, setViewingRejected] = useState<ContratoVersao | null>(null);

  const userId = profile?.user_id;
  const familiaId = profile?.familia_id;

  const { data: familia } = useQuery({
    queryKey: ["familia", familiaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("familia")
        .select("nome")
        .eq("id", familiaId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!familiaId,
  });

  const { data: responsaveis } = useQuery({
    queryKey: ["responsaveis", familiaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("nome")
        .eq("familia_id", familiaId!)
        .eq("tipo_perfil", "responsavel");
      if (error) throw error;
      return data;
    },
    enabled: !!familiaId,
  });

  const { data: contratoVigente, isLoading } = useQuery({
    queryKey: ["contrato-vigente", familiaId, userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contrato_versao")
        .select("*")
        .eq("familia_id", familiaId!)
        .eq("crianca_id", userId!)
        .eq("status", "vigente")
        .order("versao", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as ContratoVersao | null;
    },
    enabled: !!familiaId && !!userId,
  });

  const { data: contratoPendente } = useQuery({
    queryKey: ["contrato-pendente", familiaId, userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contrato_versao")
        .select("*")
        .eq("familia_id", familiaId!)
        .eq("crianca_id", userId!)
        .eq("status", "pendente_aprovacao")
        .order("versao", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as ContratoVersao | null;
    },
    enabled: !!familiaId && !!userId,
  });

  const { data: minhasRevisoes } = useQuery({
    queryKey: ["minhas-revisoes", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contrato_revisao")
        .select("*")
        .eq("solicitante_id", userId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ContratoRevisao[];
    },
    enabled: !!userId,
  });

  const { data: contratosRejeitados } = useQuery({
    queryKey: ["contratos-rejeitados-crianca", familiaId, userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contrato_versao")
        .select("*")
        .eq("familia_id", familiaId!)
        .eq("crianca_id", userId!)
        .eq("status", "rejeitado")
        .order("versao", { ascending: false });
      if (error) throw error;
      return data as ContratoVersao[];
    },
    enabled: !!familiaId && !!userId,
  });

  const aprovarContrato = useMutation({
    mutationFn: async () => {
      if (!contratoPendente) return;
      if (contratoVigente) {
        await supabase
          .from("contrato_versao")
          .update({ status: "substituido" })
          .eq("id", contratoVigente.id);
      }
      const { error } = await supabase
        .from("contrato_versao")
        .update({
          status: "vigente",
          aprovado_por: userId!,
          data_aprovacao: new Date().toISOString(),
          data_vigencia: new Date().toISOString(),
        })
        .eq("id", contratoPendente.id);
      if (error) throw error;
      // configuracao_familia is synced automatically via database trigger
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contrato-vigente", familiaId, userId] });
      queryClient.invalidateQueries({ queryKey: ["contrato-pendente", familiaId, userId] });
      queryClient.invalidateQueries({ queryKey: ["config-familia"] });
      toast({ title: "Contrato aprovado! 🎉 Novas regras em vigor." });
    },
    onError: () => toast({ title: "Erro ao aprovar", variant: "destructive" }),
  });

  const rejeitarContrato = useMutation({
    mutationFn: async () => {
      if (!contratoPendente) return;
      const { error } = await supabase
        .from("contrato_versao")
        .update({ status: "rejeitado" })
        .eq("id", contratoPendente.id);
      if (error) throw error;

      await supabase.from("contrato_revisao").insert({
        familia_id: familiaId!,
        crianca_id: userId!,
        contrato_versao_id: contratoPendente.id,
        solicitante_id: userId!,
        justificativa: `Contrato rejeitado: ${justificativaRejeicao}`,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contrato-pendente", familiaId, userId] });
      queryClient.invalidateQueries({ queryKey: ["minhas-revisoes"] });
      toast({ title: "Contrato rejeitado" });
      setShowRejeitar(false);
      setJustificativaRejeicao("");
    },
    onError: () => toast({ title: "Erro ao rejeitar", variant: "destructive" }),
  });

  const solicitarRevisao = useMutation({
    mutationFn: async () => {
      if (!contratoVigente) return;
      const { error } = await supabase.from("contrato_revisao").insert({
        familia_id: familiaId!,
        crianca_id: userId!,
        contrato_versao_id: contratoVigente.id,
        solicitante_id: userId!,
        justificativa,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["minhas-revisoes"] });
      toast({ title: "Solicitação enviada! 📨" });
      setShowRevisao(false);
      setJustificativa("");
    },
    onError: () => toast({ title: "Erro ao solicitar", variant: "destructive" }),
  });

  const nomeFamilia = familia?.nome ?? "Nossa Família";
  const nomeCrianca = profile?.nome ?? "Contratado(a)";
  const nomesResponsaveis = responsaveis?.map((r) => r.nome).join(" e ") ?? "Responsável(is)";

  const renderPergaminhoBody = (c: ContratoVersao) => {
    const dataFormatada = c.data_vigencia
      ? format(new Date(c.data_vigencia), "d 'de' MMMM 'de' yyyy", { locale: ptBR })
      : format(new Date(c.created_at), "d 'de' MMMM 'de' yyyy", { locale: ptBR });
    const isVigente = c.status === "vigente";
    const isPendente = c.status === "pendente_aprovacao";

    let clausulaNum = 0;

    return (
      <div className="pergaminho rounded-2xl p-6 sm:p-8 relative overflow-hidden">
        {isVigente && (
          <div className="selo-aprovado">
            ✓<br />Aprovado
          </div>
        )}

        {/* Header */}
        <div className="text-center space-y-2 mb-6">
          <p className="text-xs tracking-[0.3em] uppercase text-muted-foreground font-semibold">═══════════════════</p>
          <h2 className="font-display text-xl sm:text-2xl font-bold">
            📜 {isPendente ? "Proposta de Contrato" : "Contrato de Autonomia"}
          </h2>
          <p className="text-sm font-semibold text-muted-foreground">
            Versão nº {c.versao}
            {isPendente && <Badge className="ml-2 bg-yellow-100 text-yellow-800">Aguardando aprovação</Badge>}
          </p>
          <p className="text-xs tracking-[0.3em] uppercase text-muted-foreground font-semibold">═══════════════════</p>
        </div>

        {/* Preamble */}
        <div className="space-y-3 text-sm leading-relaxed mb-4">
          <p>
            {isPendente ? "Proposto" : "Celebrado"} em <strong>{dataFormatada}</strong>, entre as partes abaixo qualificadas, que de comum acordo estabelecem as seguintes cláusulas:
          </p>
          <div className="pl-4 space-y-1">
            <p><strong>CONTRATANTE{responsaveis && responsaveis.length > 1 ? "S" : ""}:</strong> {nomesResponsaveis}, responsáve{responsaveis && responsaveis.length > 1 ? "is" : "l"} da família <em>{nomeFamilia}</em>.</p>
            <p><strong>CONTRATADO(A):</strong> {nomeCrianca}, membro da família <em>{nomeFamilia}</em>.</p>
          </div>
        </div>

        {/* Cláusula — Deveres */}
        {(c.regras_ouro?.length ?? 0) > 0 && (
          <>
            <hr className="pergaminho-separator my-5" />
            <div className="space-y-2 mb-4">
              <h3 className="font-display font-bold text-base">Cláusula {++clausulaNum}ª — Dos Deveres</h3>
              <p className="text-sm leading-relaxed">O(A) CONTRATADO(A) compromete-se a cumprir diariamente os seguintes deveres, de forma responsável e sem necessidade de cobrança:</p>
              <div className="pl-4 space-y-1.5">
                {c.regras_ouro.map((r, i) => (
                  <p key={i} className="text-sm"><span className="font-semibold text-muted-foreground mr-2">{toRoman(i + 1)}.</span>{r}</p>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Cláusula — Direitos */}
        {(c.direitos?.length ?? 0) > 0 && (
          <>
            <hr className="pergaminho-separator my-5" />
            <div className="space-y-2 mb-4">
              <h3 className="font-display font-bold text-base">Cláusula {++clausulaNum}ª — Dos Direitos</h3>
              <p className="text-sm leading-relaxed">Em contrapartida ao cumprimento dos deveres, o(a) CONTRATADO(A) tem assegurados os seguintes direitos:</p>
              <div className="pl-4 space-y-1.5">
                {c.direitos.map((d: string, i: number) => (
                  <p key={i} className="text-sm"><span className="font-semibold text-muted-foreground mr-2">{toRoman(i + 1)}.</span>{d}</p>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Cláusula — Consequências */}
        {(c.consequencias_naturais?.length ?? 0) > 0 && (
          <>
            <hr className="pergaminho-separator my-5" />
            <div className="space-y-2 mb-4">
              <h3 className="font-display font-bold text-base">Cláusula {++clausulaNum}ª — Das Consequências</h3>
              <p className="text-sm leading-relaxed">O não cumprimento dos deveres estabelecidos acarretará as seguintes consequências:</p>
              <div className="pl-4 space-y-1.5">
                {c.consequencias_naturais.map((cn, i) => (
                  <p key={i} className="text-sm"><span className="font-semibold text-muted-foreground mr-2">{toRoman(i + 1)}.</span>{cn}</p>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Cláusula — Limites */}
        <hr className="pergaminho-separator my-5" />
        <div className="space-y-2 mb-4">
          <h3 className="font-display font-bold text-base">Cláusula {++clausulaNum}ª — Dos Limites de Resgate</h3>
          <p className="text-sm leading-relaxed">O(A) CONTRATADO(A) poderá resgatar recompensas dentro dos seguintes limites acordados:</p>
          <div className="pl-4 space-y-1.5">
            <p className="text-sm"><span className="font-semibold text-muted-foreground mr-2">I.</span>Limite diário de resgate: <strong>{c.limite_resgate_diario} moedas</strong>.</p>
          </div>
        </div>

        {/* Alterações */}
        {c.descricao_alteracoes && (
          <>
            <hr className="pergaminho-separator my-5" />
            <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 text-sm">
              <p className="font-medium">📝 Alterações nesta versão:</p>
              <p className="mt-1 text-muted-foreground">{c.descricao_alteracoes}</p>
            </div>
          </>
        )}

        {/* Assinatura */}
        <hr className="pergaminho-separator my-5" />
        <div className="text-center space-y-3 mt-4">
          <p className="text-xs text-muted-foreground italic">
            E por estarem de acordo com todas as cláusulas acima, as partes assinam o presente contrato.
          </p>
          {isVigente && c.data_aprovacao && (
            <div className="space-y-1">
              <p className="text-sm font-semibold">✍️ Assinado digitalmente</p>
              <p className="text-xs text-muted-foreground">
                Aprovado por <strong>{nomeCrianca}</strong> em {format(new Date(c.data_aprovacao), "d 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}
              </p>
            </div>
          )}
          <p className="text-xs tracking-[0.3em] uppercase text-muted-foreground font-semibold mt-4">═══════════════════</p>
        </div>
      </div>
    );
  };

  if (isLoading) {
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
          <p className="text-muted-foreground">Nossos combinados em família</p>
        </motion.div>

        {contratoPendente && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
            <div className="rounded-lg border-2 border-yellow-400 bg-yellow-50 p-4">
              <p className="font-semibold text-yellow-800 flex items-center gap-2">
                <Clock className="h-4 w-4" /> Nova versão aguardando sua aprovação!
              </p>
              <p className="text-sm text-yellow-700 mt-1">Leia com atenção e decida se concorda com as novas regras.</p>
            </div>
            <motion.div initial={{ opacity: 0, scaleY: 0.85 }} animate={{ opacity: 1, scaleY: 1 }} transition={{ duration: 0.5, ease: "easeOut" }} style={{ transformOrigin: "top" }}>
              {renderPergaminhoBody(contratoPendente)}
            </motion.div>
            <div className="flex gap-3">
              <Button onClick={() => aprovarContrato.mutate()} disabled={aprovarContrato.isPending} className="flex-1">
                {aprovarContrato.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle2 className="h-4 w-4 mr-1" /> Eu Concordo</>}
              </Button>
              <Button variant="outline" onClick={() => { setShowRejeitar(true); setJustificativaRejeicao(""); }} className="flex-1">
                <XCircle className="h-4 w-4 mr-1" /> Não Concordo
              </Button>
            </div>
          </motion.div>
        )}

        {contratoVigente ? (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="space-y-3">
            {contratoPendente && <h2 className="font-display text-lg font-semibold mt-6 mb-2">Contrato Atual</h2>}
            <motion.div initial={{ opacity: 0, scaleY: 0.85 }} animate={{ opacity: 1, scaleY: 1 }} transition={{ duration: 0.5, ease: "easeOut", delay: 0.2 }} style={{ transformOrigin: "top" }}>
              {renderPergaminhoBody(contratoVigente)}
            </motion.div>
            <Button variant="outline" onClick={() => setShowRevisao(true)} className="w-full">
              <MessageSquare className="h-4 w-4 mr-2" /> Solicitar Revisão
            </Button>
          </motion.div>
        ) : !contratoPendente && (
          <Card className="border-2 border-dashed">
            <CardContent className="py-8 text-center">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">Nenhum contrato criado ainda.</p>
              <p className="text-sm text-muted-foreground">Peça para seus pais criarem o contrato de autonomia!</p>
            </CardContent>
          </Card>
        )}

        {((minhasRevisoes?.length ?? 0) > 0 || (contratosRejeitados?.length ?? 0) > 0) && (
          <div className="space-y-3">
            <h2 className="font-display text-lg font-semibold">Minhas Solicitações</h2>

            {contratosRejeitados?.map(cr => (
              <Card key={cr.id} className="border border-destructive/30">
                <CardContent className="py-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-red-100 text-red-800">Contrato Rejeitado</Badge>
                      <span className="text-xs text-muted-foreground">Versão {cr.versao}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{format(new Date(cr.created_at), "dd/MM/yyyy", { locale: ptBR })}</span>
                  </div>
                  {cr.descricao_alteracoes && <p className="text-sm text-muted-foreground">{cr.descricao_alteracoes}</p>}
                  <Button size="sm" variant="outline" onClick={() => setViewingRejected(cr)} className="w-full">
                    <Eye className="h-4 w-4 mr-1" /> Visualizar Contrato
                  </Button>
                </CardContent>
              </Card>
            ))}

            {minhasRevisoes?.map(r => (
              <Card key={r.id} className="border">
                <CardContent className="py-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <Badge className={r.status === "pendente" ? "bg-yellow-100 text-yellow-800" : r.status === "aceita" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}>
                      {r.status === "pendente" ? "Aguardando" : r.status === "aceita" ? "Aceita" : "Recusada"}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{format(new Date(r.created_at), "dd/MM/yyyy", { locale: ptBR })}</span>
                  </div>
                  <p className="text-sm">{r.justificativa}</p>
                  {r.resposta && (
                    <div className="text-sm bg-primary/5 rounded-lg p-2">
                      <span className="font-medium">Resposta:</span> {r.resposta}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Dialog open={showRevisao} onOpenChange={setShowRevisao}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Solicitar Revisão do Contrato</DialogTitle>
            </DialogHeader>
            <div>
              <Label>Por que você quer mudar algo?</Label>
              <Textarea placeholder="Explique o que gostaria de mudar e por quê..." value={justificativa} onChange={e => setJustificativa(e.target.value)} className="mt-1" />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowRevisao(false)}>Cancelar</Button>
              <Button onClick={() => solicitarRevisao.mutate()} disabled={solicitarRevisao.isPending || !justificativa.trim()}>
                {solicitarRevisao.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="h-4 w-4 mr-1" /> Enviar</>}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showRejeitar} onOpenChange={setShowRejeitar}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Rejeitar Nova Versão</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Explique por que não concorda com as novas regras.</p>
              <div>
                <Label>Justificativa *</Label>
                <Textarea placeholder="Explique o que não concorda e por quê..." value={justificativaRejeicao} onChange={e => setJustificativaRejeicao(e.target.value)} className="mt-1" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowRejeitar(false)}>Voltar</Button>
              <Button variant="destructive" onClick={() => rejeitarContrato.mutate()} disabled={rejeitarContrato.isPending || !justificativaRejeicao.trim()}>
                {rejeitarContrato.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar Rejeição"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!viewingRejected} onOpenChange={(o) => { if (!o) setViewingRejected(null); }}>
          <DialogContent className="max-h-[90vh] overflow-y-auto max-w-2xl">
            <DialogHeader>
              <DialogTitle>Contrato Rejeitado — Versão {viewingRejected?.versao}</DialogTitle>
            </DialogHeader>
            {viewingRejected && renderPergaminhoBody(viewingRejected)}
            <DialogFooter>
              <Button variant="outline" onClick={() => setViewingRejected(null)}>Fechar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
