import { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useSelectedChild } from "@/contexts/SelectedChildContext";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays, Plus, Loader2, Check, Trash2, Edit, BookOpen,
  Stethoscope, Dumbbell, User, MoreHorizontal, CalendarIcon, Clock,
} from "lucide-react";
import { motion } from "framer-motion";
import { format, addDays, isSameDay, parseISO, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { Tables } from "@/integrations/supabase/types";

type CategoriaCompromisso = "prova" | "medico" | "esporte" | "pessoal" | "outro";
type Profile = Tables<"profiles">;

interface Compromisso {
  id: string;
  familia_id: string;
  crianca_id: string;
  criado_por: string;
  nome: string;
  descricao: string | null;
  categoria: CategoriaCompromisso;
  data_hora: string;
  concluido: boolean;
  created_at: string;
  updated_at: string;
}

const categoriasConfig: Record<CategoriaCompromisso, { label: string; emoji: string }> = {
  prova: { label: "Prova", emoji: "📝" },
  medico: { label: "Médico", emoji: "🏥" },
  esporte: { label: "Esporte", emoji: "⚽" },
  pessoal: { label: "Pessoal", emoji: "👤" },
  outro: { label: "Outro", emoji: "📌" },
};

export default function CompromissosFilhos() {
  const { profile } = useAuth();
  const { selectedChildId, setSelectedChildId } = useSelectedChild();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"proximos" | "calendario">("proximos");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [categoria, setCategoria] = useState<CategoriaCompromisso>("outro");
  const [dataCompromisso, setDataCompromisso] = useState<Date>(new Date());
  const [hora, setHora] = useState("08:00");
  const [criancaIdForm, setCriancaIdForm] = useState("");
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  const resetForm = () => {
    setNome(""); setDescricao(""); setCategoria("outro");
    setDataCompromisso(new Date()); setHora("08:00"); setEditingId(null);
    setCriancaIdForm("");
  };

  // Fetch children
  const { data: children } = useQuery({
    queryKey: ["filhos-familia", profile?.familia_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("familia_id", profile!.familia_id)
        .eq("tipo_perfil", "crianca");
      if (error) throw error;
      return data as Profile[];
    },
    enabled: !!profile,
  });

  // Fetch compromissos
  const { data: compromissos, isLoading } = useQuery({
    queryKey: ["compromissos-filhos", profile?.familia_id, selectedChildId],
    queryFn: async () => {
      let query = supabase
        .from("compromisso")
        .select("*")
        .eq("familia_id", profile!.familia_id)
        .order("data_hora", { ascending: true });
      if (selectedChildId && selectedChildId !== "todos") {
        query = query.eq("crianca_id", selectedChildId);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data as Compromisso[];
    },
    enabled: !!profile,
  });

  const getChildName = (id: string) => children?.find((c) => c.user_id === id)?.nome ?? "—";

  const openCreate = () => {
    resetForm();
    if (selectedChildId && selectedChildId !== "todos") setCriancaIdForm(selectedChildId);
    setDialogOpen(true);
  };

  const openEdit = (c: Compromisso) => {
    setEditingId(c.id);
    setNome(c.nome);
    setDescricao(c.descricao ?? "");
    setCategoria(c.categoria);
    setCriancaIdForm(c.crianca_id);
    const dt = parseISO(c.data_hora);
    setDataCompromisso(dt);
    setHora(format(dt, "HH:mm"));
    setDialogOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!profile || !nome.trim() || !criancaIdForm) throw new Error("Campos obrigatórios");
      const [h, m] = hora.split(":").map(Number);
      const dt = new Date(dataCompromisso);
      dt.setHours(h, m, 0, 0);

      if (editingId) {
        const { error } = await supabase
          .from("compromisso")
          .update({ nome: nome.trim(), descricao: descricao.trim() || null, categoria, data_hora: dt.toISOString() })
          .eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("compromisso")
          .insert({
            familia_id: profile.familia_id,
            crianca_id: criancaIdForm,
            criado_por: profile.user_id,
            nome: nome.trim(),
            descricao: descricao.trim() || null,
            categoria,
            data_hora: dt.toISOString(),
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["compromissos-filhos"] });
      toast({ title: editingId ? "Compromisso atualizado! ✏️" : "Compromisso criado! 📌" });
      setDialogOpen(false);
      resetForm();
    },
    onError: (e) => toast({ title: "Erro", description: String(e), variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("compromisso").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["compromissos-filhos"] });
      toast({ title: "Compromisso excluído 🗑️" });
    },
    onError: () => toast({ title: "Erro ao excluir", variant: "destructive" }),
  });

  const next15Days = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const end = addDays(today, 15);
    const pending = (compromissos ?? []).filter((c) => !c.concluido && parseISO(c.data_hora) < today);
    const upcoming = (compromissos ?? []).filter((c) => {
      const dt = parseISO(c.data_hora);
      return dt >= today && dt <= end;
    });
    return { pending, upcoming };
  }, [compromissos]);

  const selectedDayCompromissos = useMemo(() =>
    (compromissos ?? []).filter((c) => isSameDay(parseISO(c.data_hora), selectedDate)),
    [compromissos, selectedDate]
  );

  const daysWithCompromissos = useMemo(() =>
    (compromissos ?? []).map((c) => parseISO(c.data_hora)),
    [compromissos]
  );

  const showMultiChild = !selectedChildId || selectedChildId === "todos";

  const renderCard = (c: Compromisso, i: number) => {
    const cat = categoriasConfig[c.categoria];
    const dt = parseISO(c.data_hora);
    const isOverdue = !c.concluido && dt < new Date();

    return (
      <motion.div key={c.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
        <Card className={cn(
          "border-2 transition-shadow hover:shadow-md",
          c.concluido ? "border-muted bg-muted/30 opacity-70" : isOverdue ? "border-destructive/30" : ""
        )}>
          <CardContent className="py-3">
            <div className="flex items-start gap-3">
              <div className={cn(
                "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2",
                c.concluido ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/30"
              )}>
                {c.concluido && <Check className="h-3.5 w-3.5" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-base shrink-0">{cat.emoji}</span>
                  <span className={cn("font-display font-semibold text-sm truncate", c.concluido && "line-through text-muted-foreground")}>{c.nome}</span>
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                  {showMultiChild && (
                    <Badge variant="secondary" className="text-[10px]">{getChildName(c.crianca_id)}</Badge>
                  )}
                  <span className="flex items-center gap-0.5">
                    <CalendarIcon className="h-3 w-3" /> {format(dt, "dd/MM", { locale: ptBR })}
                  </span>
                  <span className="flex items-center gap-0.5">
                    <Clock className="h-3 w-3" /> {format(dt, "HH:mm")}
                  </span>
                  <Badge variant="outline" className="text-[10px]">{cat.label}</Badge>
                  {isOverdue && <Badge variant="destructive" className="text-[10px]">Atrasado</Badge>}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)}>
                  <Edit className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteMutation.mutate(c.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    );
  };

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="font-display text-2xl font-bold flex items-center gap-2">
              <CalendarDays className="h-6 w-6 text-primary" /> Agenda dos Filhos
            </h1>
            <p className="text-sm text-muted-foreground">Compromissos e eventos</p>
          </div>
          <Button onClick={openCreate} size="sm" className="gap-1">
            <Plus className="h-4 w-4" /> Novo
          </Button>
        </div>

        {/* Child filter */}
        {(children?.length ?? 0) > 1 && (
          <Select value={selectedChildId || "todos"} onValueChange={setSelectedChildId}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Todos os filhos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os filhos</SelectItem>
              {children?.map((c) => (
                <SelectItem key={c.user_id} value={c.user_id}>{c.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "proximos" | "calendario")}>
          <TabsList className="w-full">
            <TabsTrigger value="proximos" className="flex-1">Próximos 15 dias</TabsTrigger>
            <TabsTrigger value="calendario" className="flex-1">Calendário</TabsTrigger>
          </TabsList>

          <TabsContent value="proximos" className="space-y-4 mt-4">
            {isLoading ? (
              <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            ) : (
              <>
                {next15Days.pending.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-destructive">⚠️ Atrasados</h3>
                    {next15Days.pending.map((c, i) => renderCard(c, i))}
                  </div>
                )}
                {next15Days.upcoming.length > 0 ? (
                  <div className="space-y-2">
                    {next15Days.pending.length > 0 && <h3 className="text-sm font-semibold mt-4">Próximos</h3>}
                    {next15Days.upcoming.map((c, i) => renderCard(c, i))}
                  </div>
                ) : next15Days.pending.length === 0 ? (
                  <Card className="border-dashed">
                    <CardContent className="py-8 text-center">
                      <CalendarDays className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
                      <p className="text-muted-foreground">Nenhum compromisso nos próximos 15 dias</p>
                    </CardContent>
                  </Card>
                ) : null}
              </>
            )}
          </TabsContent>

          <TabsContent value="calendario" className="space-y-4 mt-4">
            <Card>
              <CardContent className="p-2">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(d) => d && setSelectedDate(d)}
                  locale={ptBR}
                  className="p-3 pointer-events-auto mx-auto"
                  modifiers={{ hasCompromisso: daysWithCompromissos }}
                  modifiersStyles={{
                    hasCompromisso: {
                      fontWeight: "bold",
                      textDecoration: "underline",
                      textDecorationColor: "hsl(var(--primary))",
                      textUnderlineOffset: "3px",
                    },
                  }}
                />
              </CardContent>
            </Card>
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">{format(selectedDate, "dd 'de' MMMM", { locale: ptBR })}</h3>
              {selectedDayCompromissos.length > 0 ? (
                selectedDayCompromissos.map((c, i) => renderCard(c, i))
              ) : (
                <p className="text-sm text-muted-foreground py-4 text-center">Nenhum compromisso neste dia</p>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) resetForm(); setDialogOpen(open); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Compromisso" : "Novo Compromisso"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {!editingId && (
              <div>
                <Label>Filho *</Label>
                <Select value={criancaIdForm} onValueChange={setCriancaIdForm}>
                  <SelectTrigger><SelectValue placeholder="Selecione o filho" /></SelectTrigger>
                  <SelectContent>
                    {children?.map((c) => (
                      <SelectItem key={c.user_id} value={c.user_id}>{c.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Nome *</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Consulta pediatra" />
            </div>
            <div>
              <Label>Categoria</Label>
              <Select value={categoria} onValueChange={(v) => setCategoria(v as CategoriaCompromisso)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(categoriasConfig).map(([key, cfg]) => (
                    <SelectItem key={key} value={key}>{cfg.emoji} {cfg.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Data *</Label>
                <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {format(dataCompromisso, "dd/MM/yyyy")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={dataCompromisso}
                      onSelect={(d) => { if (d) { setDataCompromisso(d); setDatePickerOpen(false); } }}
                      locale={ptBR}
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label>Horário</Label>
                <Input type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Detalhes opcionais..." rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { resetForm(); setDialogOpen(false); }}>Cancelar</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !nome.trim() || !criancaIdForm}>
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              {editingId ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
