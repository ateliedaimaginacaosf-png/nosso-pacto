import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, CheckCircle2, Clock, Coins, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";

type Tarefa = Tables<"tarefa">;

const categoriasEmoji: Record<string, string> = {
  limpeza: "🧹",
  estudos: "📚",
  exercicio: "🏃",
  higiene: "🧼",
  alimentacao: "🍎",
  organizacao: "📦",
  outros: "⭐",
};

const statusLabel: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  a_fazer: { label: "A Fazer", variant: "outline" },
  pendente_aprovacao: { label: "Aguardando", variant: "secondary" },
  concluida: { label: "Concluída", variant: "default" },
  rejeitada: { label: "Rejeitada", variant: "destructive" },
};

export default function MinhasTarefas() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const { data: tarefas, isLoading } = useQuery({
    queryKey: ["minhas-tarefas", profile?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tarefa")
        .select("*")
        .eq("atribuida_a", profile!.user_id)
        .in("status", ["a_fazer", "pendente_aprovacao", "rejeitada"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Tarefa[];
    },
    enabled: !!profile,
  });

  const concluirMutation = useMutation({
    mutationFn: async (tarefaId: string) => {
      const { error } = await supabase
        .from("tarefa")
        .update({ status: "pendente_aprovacao", data_conclusao: new Date().toISOString() })
        .eq("id", tarefaId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["minhas-tarefas"] });
      toast({ title: "Tarefa enviada! ✅", description: "Aguardando aprovação do responsável." });
    },
    onError: () => {
      toast({ title: "Erro", description: "Não foi possível concluir a tarefa.", variant: "destructive" });
    },
  });

  return (
    <AppLayout>
      <div className="space-y-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="font-display text-2xl font-bold md:text-3xl">Minhas Tarefas 📋</h1>
          <p className="text-muted-foreground">Complete tarefas e ganhe moedas!</p>
        </motion.div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : !tarefas?.length ? (
          <Card className="border-dashed border-2">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <ClipboardList className="mb-4 h-12 w-12 text-muted-foreground/50" />
              <p className="font-display text-lg font-semibold">Nenhuma tarefa no momento</p>
              <p className="text-sm text-muted-foreground">Quando seu responsável criar tarefas, elas aparecerão aqui!</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            <AnimatePresence>
              {tarefas.map((tarefa, i) => (
                <motion.div
                  key={tarefa.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -100 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Card className="border-2 transition-shadow hover:shadow-md">
                    <CardContent className="flex items-center gap-4 py-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-2xl">
                        {categoriasEmoji[tarefa.categoria] ?? "⭐"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-display font-semibold truncate">{tarefa.nome}</p>
                          <Badge variant={statusLabel[tarefa.status]?.variant ?? "outline"}>
                            {statusLabel[tarefa.status]?.label ?? tarefa.status}
                          </Badge>
                        </div>
                        {tarefa.descricao && (
                          <p className="text-sm text-muted-foreground line-clamp-1">{tarefa.descricao}</p>
                        )}
                        <div className="mt-1 flex items-center gap-1 text-sm font-semibold text-coin-foreground">
                          <Coins className="h-3.5 w-3.5 text-coin" />
                          {tarefa.valor_moedas} moedas
                        </div>
                        {tarefa.status === "rejeitada" && tarefa.comentario_responsavel && (
                          <p className="mt-1 text-xs text-destructive">💬 {tarefa.comentario_responsavel}</p>
                        )}
                      </div>
                      {(tarefa.status === "a_fazer" || tarefa.status === "rejeitada") && (
                        <Button
                          size="sm"
                          onClick={() => concluirMutation.mutate(tarefa.id)}
                          disabled={concluirMutation.isPending}
                          className="shrink-0"
                        >
                          {concluirMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <CheckCircle2 className="h-4 w-4" /> Feito!
                            </>
                          )}
                        </Button>
                      )}
                      {tarefa.status === "pendente_aprovacao" && (
                        <div className="flex items-center gap-1 text-sm text-muted-foreground shrink-0">
                          <Clock className="h-4 w-4" /> Aguardando
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
