import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Gift, Coins, Loader2, Trash2, CheckCircle2, XCircle, Pencil, Search } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "@/hooks/use-toast";
import { useState, useMemo } from "react";
import type { Tables } from "@/integrations/supabase/types";

type Recompensa = Tables<"recompensa">;

interface StatusResgate {
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline";
}

const statusResgate: Record<string, StatusResgate> = {
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
  const [filtroAtivo, setFiltroAtivo] = useState<"todos" | "ativas" | "inativas">("ativas");
  const [searchQuery, setSearchQuery] = useState("");
  const [exigeAprovacao, setExigeAprovacao] = useState(true);
  const [editando, setEditando] = useState<Recompensa | null>(null);
  const [editNome, setEditNome] = useState("");
  const [editDescricao, setEditDescricao] = useState("");
  const [editCusto, setEditCusto] = useState("");
  const [editExigeAprovacao, setEditExigeAprovacao] = useState(true);

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

  const { data: membrosAll } = useQuery({
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

  const criancas = membrosAll?.filter(m => m.tipo_perfil === "crianca") ?? [];

  const criarRecompensa = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("recompensa").insert({
        nome,
        descricao: descricao || null,
        custo_moedas: parseInt(custoMoedas) || 1,
        familia_id: profile!.familia_id,
        exige_aprovacao: exigeAprovacao,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recompensas-gerenciar"] });
      toast({ title: "Recompensa criada! 🎁" });
      setDialogOpen(false);
      setNome(""); setDescricao(""); setCustoMoedas("10"); setExigeAprovacao(true);
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

  const editarRecompensa = useMutation({
    mutationFn: async () => {
      if (!editando) return;
      const { error } = await supabase.from("recompensa").update({
        nome: editNome,
        descricao: editDescricao || null,
        custo_moedas: parseInt(editCusto) || 1,
        exige_aprovacao: editExigeAprovacao,
      }).eq("id", editando.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recompensas-gerenciar"] });
      toast({ title: "Recompensa atualizada! ✏️" });
      setEditando(null);
    },
    onError: () => toast({ title: "Erro ao atualizar", variant: "destructive" }),
  });

  const aprovarResgate = useMutation({
    mutationFn: async (resgateId: string) => {
      const resgate = resgates?.find(r => r.id === resgateId);
      if (!resgate) throw new Error("Resgate não encontrado");
      const { error } = await supabase
        .from("resgate_recompensa")
        .update({ status: "aprovada", aprovado_por: profile!.user_id })
        .eq("id", resgateId);
      if (error) throw error;
      const { data: saldoAtual } = await supabase.rpc("calcular_saldo", { _user_id: resgate.crianca_id });
      const anterior = (saldoAtual as number) ?? 0;
      const novoSaldo = anterior - resgate.custo_moedas;
      await supabase.from("transacao").insert({
        user_id: resgate.crianca_id,
        familia_id: profile!.familia_id,
        tipo: "resgate_recompensa" as const,
        quantidade_moedas: resgate.custo_moedas,
        saldo_anterior: anterior,
        saldo_posterior: novoSaldo,
        descricao: `Resgate: ${(resgate as any).recompensa?.nome ?? "Recompensa"}`,
      });
      await supabase.from("profiles")
        .update({ saldo_moedas: novoSaldo })
        .eq("user_id", resgate.crianca_id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["resgates-pendentes"] });
      queryClient.invalidateQueries({ queryKey: ["saldo-crianca"] });
      toast({ title: "Resgate aprovado! ✅" });
    },
    onError: () => toast({ title: "Erro ao aprovar", variant: "destructive" }),
  });

  const rejeitarResgate = useMutation({
    mutationFn: async (resgateId: string) => {
      const resgate = resgates?.find(r => r.id === resgateId);
      if (!resgate) throw new Error("Resgate não encontrado");
      const { error } = await supabase
        .from("resgate_recompensa")
        .update({ status: "rejeitada", aprovado_por: profile!.user_id })
        .eq("id", resgateId);
      if (error) throw error;
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

  const filteredRecompensas = useMemo(() => {
    if (!recompensas) return [];
    return recompensas.filter(r => {
      const matchAtivo = filtroAtivo === "todos" || (filtroAtivo === "ativas" ? r.ativa : !r.ativa);
      const matchSearch = !searchQuery ||
        r.nome.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (r.descricao ?? "").toLowerCase().includes(searchQuery.toLowerCase());
      return matchAtivo && matchSearch;
    });
  }, [recompensas, filtroAtivo, searchQuery]);

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
                <div className="flex items-center justify-between"><Label>Exige aprovação do responsável</Label><Switch checked={exigeAprovacao} onCheckedChange={setExigeAprovacao} /></div>
              </div>
              <DialogFooter>
                <Button onClick={() => criarRecompensa.mutate()} disabled={!nome.trim() || criarRecompensa.isPending}>
                  {criarRecompensa.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </motion.div>

        {/* Filters */}
        <div className="space-y-2">
          <Tabs value={filtroAtivo} onValueChange={(v) => setFiltroAtivo(v as typeof filtroAtivo)}>
            <TabsList>
              <TabsTrigger value="ativas">Ativas</TabsTrigger>
              <TabsTrigger value="inativas">Inativas</TabsTrigger>
              <TabsTrigger value="todos">Todas</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar recompensa..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-xs"
            />
          </div>
        </div>

        {isLoading ? (
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
          <div className="space-y-3">
            <AnimatePresence>
              {filteredRecompensas.map((r, i) => (
                <motion.div key={r.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                  <Card className={`border-2 ${!r.ativa ? "opacity-60" : ""}`}>
                    <CardContent className="py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-display font-semibold text-sm truncate">
                          🎁 {r.nome}
                        </p>
                        {r.descricao && (
                          <p className="text-xs text-muted-foreground italic truncate mt-0.5">{r.descricao}</p>
                        )}
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground flex-wrap">
                          <span className="font-semibold text-coin-foreground flex items-center gap-0.5">
                            <Coins className="h-3 w-3 text-coin" /> {r.custo_moedas} moedas
                          </span>
                          {!r.exige_aprovacao && <Badge variant="outline" className="text-[10px] px-1.5 py-0">Auto</Badge>}
                          {!r.ativa && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Inativa</Badge>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 justify-end">
                        <Switch checked={r.ativa} onCheckedChange={(checked) => toggleAtiva.mutate({ id: r.id, ativa: checked })} />
                        <Button size="sm" variant="ghost" onClick={() => { setEditando(r); setEditNome(r.nome); setEditDescricao(r.descricao ?? ""); setEditCusto(String(r.custo_moedas)); setEditExigeAprovacao(r.exige_aprovacao); }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => deletarRecompensa.mutate(r.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}</AnimatePresence>
          </div>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editando} onOpenChange={(open) => { if (!open) setEditando(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-display">Editar Recompensa</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Nome</Label><Input value={editNome} onChange={e => setEditNome(e.target.value)} /></div>
            <div><Label>Descrição (opcional)</Label><Textarea value={editDescricao} onChange={e => setEditDescricao(e.target.value)} /></div>
            <div><Label>Custo em Moedas</Label><Input type="number" min="1" value={editCusto} onChange={e => setEditCusto(e.target.value)} /></div>
            <div className="flex items-center justify-between"><Label>Exige aprovação do responsável</Label><Switch checked={editExigeAprovacao} onCheckedChange={setEditExigeAprovacao} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditando(null)}>Cancelar</Button>
            <Button onClick={() => editarRecompensa.mutate()} disabled={!editNome.trim() || editarRecompensa.isPending}>
              {editarRecompensa.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
