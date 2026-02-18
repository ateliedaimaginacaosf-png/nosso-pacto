import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FileText, Loader2, CheckCircle2, XCircle, MessageSquare, Clock, Send } from "lucide-react";
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

export default function ContratoAutonomiaCrianca() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const [showRevisao, setShowRevisao] = useState(false);
  const [justificativa, setJustificativa] = useState("");
  const [showRejeitar, setShowRejeitar] = useState(false);

  const userId = profile?.user_id;
  const familiaId = profile?.familia_id;

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

      // Sincronizar config da criança
      await supabase
        .from("configuracao_familia")
        .update({
          regras_ouro: contratoPendente.regras_ouro,
          direitos: (contratoPendente as any).direitos ?? [],
          consequencias_naturais: contratoPendente.consequencias_naturais,
          limite_resgate_diario: contratoPendente.limite_resgate_diario,
          resgate_imediato: contratoPendente.resgate_imediato,
        })
        .eq("familia_id", familiaId!)
        .eq("crianca_id", userId!);
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
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contrato-pendente", familiaId, userId] });
      toast({ title: "Contrato rejeitado" });
      setShowRejeitar(false);
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

  const renderContrato = (c: ContratoVersao) => (
    <Card className="border-2">
      <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <CardTitle className="font-display text-lg">Versão {c.versao}</CardTitle>
          <Badge className={c.status === "vigente" ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}>
            {c.status === "vigente" ? "Vigente" : "Pendente"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {c.descricao_alteracoes && (
          <div className="rounded-lg bg-blue-50 p-3 text-sm">
            <p className="font-medium text-blue-900">📝 O que mudou:</p>
            <p className="text-blue-800 mt-1">{c.descricao_alteracoes}</p>
          </div>
        )}

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

        <div className="flex flex-wrap gap-4 text-sm">
          <div className="rounded-lg bg-muted p-2 px-3">
            <span className="text-muted-foreground">Limite diário: </span>
            <span className="font-semibold">{c.limite_resgate_diario} moedas</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );

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
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <div className="rounded-lg border-2 border-yellow-400 bg-yellow-50 p-4 mb-4">
              <p className="font-semibold text-yellow-800 flex items-center gap-2">
                <Clock className="h-4 w-4" /> Nova versão aguardando sua aprovação!
              </p>
              <p className="text-sm text-yellow-700 mt-1">Leia com atenção e decida se concorda com as novas regras.</p>
            </div>
            {renderContrato(contratoPendente)}
            <div className="flex gap-3 mt-3">
              <Button onClick={() => aprovarContrato.mutate()} disabled={aprovarContrato.isPending} className="flex-1">
                {aprovarContrato.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle2 className="h-4 w-4 mr-1" /> Eu Concordo</>}
              </Button>
              <Button variant="outline" onClick={() => setShowRejeitar(true)} className="flex-1">
                <XCircle className="h-4 w-4 mr-1" /> Não Concordo
              </Button>
            </div>
          </motion.div>
        )}

        {contratoVigente ? (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            {contratoPendente && <h2 className="font-display text-lg font-semibold mt-6 mb-2">Contrato Atual</h2>}
            {renderContrato(contratoVigente)}
            <Button variant="outline" onClick={() => setShowRevisao(true)} className="w-full mt-3">
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

        {(minhasRevisoes?.length ?? 0) > 0 && (
          <div className="space-y-3">
            <h2 className="font-display text-lg font-semibold">Minhas Solicitações</h2>
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
              <Textarea
                placeholder="Explique o que gostaria de mudar e por quê..."
                value={justificativa}
                onChange={e => setJustificativa(e.target.value)}
                className="mt-1"
              />
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
            <p className="text-sm text-muted-foreground">Tem certeza que não concorda com as novas regras? Você pode solicitar uma revisão depois.</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowRejeitar(false)}>Voltar</Button>
              <Button variant="destructive" onClick={() => rejeitarContrato.mutate()} disabled={rejeitarContrato.isPending}>
                {rejeitarContrato.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar Rejeição"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
