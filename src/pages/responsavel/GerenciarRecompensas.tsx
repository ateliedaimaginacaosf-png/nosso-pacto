import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Gift, Coins, Loader2, Trash2, CheckCircle2, XCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "@/hooks/use-toast";
import { useState } from "react";
import type { Tables } from "@/integrations/supabase/types";

type Recompensa = Tables<"recompensa">;

const statusResgate: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pendente: { label: "Pendente", variant: "secondary" },
  aprovada: { label: "Aprovada", variant: "default" },
  rejeitada: { label: "Rejeitada", variant: "destructive" },
  revertida: { label: "Revertida", variant: "outline" },
};

export default function GerenciarRecompensas() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [custoMoedas, setCustoMoedas] = useState("10");
  const [tab, setTab] = useState<"recompensas" | "resgates">("recompensas");

  const { data: recompensas, isLoading } = useQuery({
    queryKey: ["recompensas-gerenciar", profile?.familia_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recompensa")
        .select("*")
        .eq("familia_id", profile!.familia_id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Recompensa[];
    },
    enabled: !!profile,
  });

  const { data: resgates } = useQuery({
    queryKey: ["resgates-pendentes", profile?.familia_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("resgate_recompensa")
        .select("*, recompensa(nome)")
        .eq("familia_id", profile!.familia_id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!profile,
  });

  const { data: criancas } = useQuery({
    queryKey: ["criancas-familia-recomp", profile?.familia_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, nome")
        .eq("familia_id", profile!.familia_id)
        .eq("tipo_perfil", "crianca");
      if (error) throw error;
      return data;
    },
    enabled: !!profile,
  });

  const criarRecompensa = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("recompensa").insert({
        nome,
        descricao: descricao || null,
        custo_moedas: parseInt(custoMoedas) || 1,
        familia_id: profile!.familia_id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recompensas-gerenciar"] });
      toast({ title: "Recompensa criada! 🎁" });
      setDialogOpen(false);
      setNome(""); setDescricao(""); setCustoMoedas("10");
    },
    onError: () => toast({ title: "Erro ao criar", variant: "destructive" }),
  });

  const toggleAtiva = useMutation({
    mutationFn: async ({ id, ativa }: { id: string; ativa: boolean }) => {
      const { error } = await supabase.from("recompensa").update({ ativa }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["recompensas-gerenciar"] }),
  });

  const deletarRecompensa = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("recompensa").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recompensas-gerenciar"] });
      toast({ title: "Recompensa removida" });
    },
    onError: () => toast({ title: "Erro ao remover", variant: "destructive" }),
  });

  const aprovarResgate = useMutation({
    mutationFn: async (resgateId: string) => {
      const { error } = await supabase
        .from("resgate_recompensa")
        .update({ status: "aprovada", aprovado_por: profile!.user_id })
        .eq("id", resgateId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["resgates-pendentes"] });
      toast({ title: "Resgate aprovado! ✅" });
    },
    onError: () => toast({ title: "Erro ao aprovar", variant: "destructive" }),
  });

  const rejeitarResgate = useMutation({
    mutationFn: async (resgateId: string) => {
      const resgate = resgates?.find(r => r.id === resgateId);
      if (!resgate) throw new Error("Resgate não encontrado");

      // Reject
      const { error } = await supabase
        .from("resgate_recompensa")
        .update({ status: "rejeitada", aprovado_por: profile!.user_id })
        .eq("id", resgateId);
      if (error) throw error;

      // Refund coins
      const { data: saldoAtual } = await supabase.rpc("calcular_saldo", { _user_id: resgate.crianca_id });
      const anterior = (saldoAtual as number) ?? 0;

      await supabase.from("transacao").insert({
        user_id: resgate.crianca_id,
        familia_id: profile!.familia_id,
        tipo: "reversao",
        quantidade_moedas: resgate.custo_moedas,
        saldo_anterior: anterior,
        saldo_posterior: anterior + resgate.custo_moedas,
        referencia_id: resgateId,
        descricao: "Resgate rejeitado - moedas devolvidas",
      });

      await supabase
        .from("profiles")
        .update({ saldo_moedas: anterior + resgate.custo_moedas })
        .eq("user_id", resgate.crianca_id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["resgates-pendentes"] });
      toast({ title: "Resgate rejeitado, moedas devolvidas" });
    },
    onError: () => toast({ title: "Erro ao rejeitar", variant: "destructive" }),
  });

  const getCriancaNome = (userId: string) => criancas?.find(c => c.user_id === userId)?.nome ?? "Criança";
  const pendentes = resgates?.filter(r => r.status === "pendente") ?? [];

  return (
    <AppLayout>
      <div className="space-y-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold md:text-3xl">Recompensas 🎁</h1>
            <p className="text-muted-foreground">Gerencie prêmios e aprovações de resgate</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4" /> Nova Recompensa</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle className="font-display">Criar Recompensa</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div><Label>Nome</Label><Input placeholder="Ex: 30 min de videogame" value={nome} onChange={e => setNome(e.target.value)} /></div>
                <div><Label>Descrição (opcional)</Label><Textarea placeholder="Detalhes..." value={descricao} onChange={e => setDescricao(e.target.value)} /></div>
                <div><Label>Custo em Moedas</Label><Input type="number" min="1" value={custoMoedas} onChange={e => setCustoMoedas(e.target.value)} /></div>
              </div>
              <DialogFooter>
                <Button onClick={() => criarRecompensa.mutate()} disabled={!nome.trim() || criarRecompensa.isPending}>
                  {criarRecompensa.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </motion.div>

        {/* Tabs */}
        <div className="flex gap-2">
          <Button variant={tab === "recompensas" ? "default" : "outline"} size="sm" onClick={() => setTab("recompensas")}>
            🎁 Recompensas
          </Button>
          <Button variant={tab === "resgates" ? "default" : "outline"} size="sm" onClick={() => setTab("resgates")}>
            ⏳ Resgates {pendentes.length > 0 && <Badge variant="destructive" className="ml-1">{pendentes.length}</Badge>}
          </Button>
        </div>

        {tab === "recompensas" && (
          isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          ) : !recompensas?.length ? (
            <Card className="border-dashed border-2">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Gift className="mb-4 h-12 w-12 text-muted-foreground/50" />
                <p className="font-display text-lg font-semibold">Nenhuma recompensa</p>
                <p className="text-sm text-muted-foreground">Crie a primeira recompensa da família!</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <AnimatePresence>
                {recompensas.map((r, i) => (
                  <motion.div key={r.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                    <Card className={`border-2 ${!r.ativa ? "opacity-60" : ""}`}>
                      <CardContent className="flex items-center gap-4 py-4">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent/10 text-2xl">🎁</div>
                        <div className="flex-1 min-w-0">
                          <p className="font-display font-semibold truncate">{r.nome}</p>
                          {r.descricao && <p className="text-sm text-muted-foreground line-clamp-1">{r.descricao}</p>}
                          <div className="mt-1 flex items-center gap-1 text-sm font-semibold text-coin-foreground">
                            <Coins className="h-3.5 w-3.5 text-coin" /> {r.custo_moedas} moedas
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Switch checked={r.ativa} onCheckedChange={(checked) => toggleAtiva.mutate({ id: r.id, ativa: checked })} />
                          <Button size="sm" variant="ghost" onClick={() => deletarRecompensa.mutate(r.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )
        )}

        {tab === "resgates" && (
          !resgates?.length ? (
            <Card className="border-dashed border-2">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Gift className="mb-4 h-12 w-12 text-muted-foreground/50" />
                <p className="font-display text-lg font-semibold">Nenhum resgate</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {resgates.map((r, i) => (
                <motion.div key={r.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                  <Card className={`border-2 ${r.status === "pendente" ? "border-accent/40" : ""}`}>
                    <CardContent className="flex items-center gap-4 py-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent/10 text-2xl">🎁</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-display font-semibold truncate">{(r.recompensa as any)?.nome ?? "Recompensa"}</p>
                          <Badge variant={statusResgate[r.status]?.variant ?? "outline"}>
                            {statusResgate[r.status]?.label ?? r.status}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {getCriancaNome(r.crianca_id)} • {r.custo_moedas} moedas
                        </p>
                      </div>
                      {r.status === "pendente" && (
                        <div className="flex gap-2 shrink-0">
                          <Button size="sm" onClick={() => aprovarResgate.mutate(r.id)} disabled={aprovarResgate.isPending}>
                            <CheckCircle2 className="h-4 w-4" /> Aprovar
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => rejeitarResgate.mutate(r.id)} disabled={rejeitarResgate.isPending}>
                            <XCircle className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          )
        )}
      </div>
    </AppLayout>
  );
}
