import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Clock, AlertTriangle, Archive, ClipboardList, MessageSquare, Calendar, User, Coins, XCircle, Camera, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Tables } from "@/integrations/supabase/types";

type Tarefa = Tables<"tarefa">;

type Interacao = {
  id: string;
  tarefa_id: string;
  user_id: string;
  status_anterior: string | null;
  status_novo: string;
  mensagem: string | null;
  foto_url: string | null;
  created_at: string;
};

const statusConfig: Record<string, { label: string; icon: typeof CheckCircle2; color: string; badgeVariant: "default" | "secondary" | "destructive" | "outline" }> = {
  a_fazer: { label: "A fazer", icon: ClipboardList, color: "text-primary", badgeVariant: "default" },
  nao_feita: { label: "Não feita", icon: XCircle, color: "text-muted-foreground", badgeVariant: "destructive" },
  pendente_aprovacao: { label: "Em validação", icon: Clock, color: "text-yellow-600", badgeVariant: "outline" },
  concluida: { label: "Concluída", icon: CheckCircle2, color: "text-success", badgeVariant: "secondary" },
  rejeitada: { label: "Rejeitada", icon: AlertTriangle, color: "text-destructive", badgeVariant: "destructive" },
  dispensa_solicitada: { label: "Dispensa", icon: Clock, color: "text-orange-500", badgeVariant: "outline" },
  arquivada: { label: "Dispensada", icon: Archive, color: "text-muted-foreground", badgeVariant: "secondary" },
};

const categoriaLabels: Record<string, string> = {
  limpeza: "Limpeza", estudos: "Estudos", exercicio: "Exercício",
  higiene: "Higiene", alimentacao: "Alimentação", organizacao: "Organização", outros: "Outros",
};

const statusLabels: Record<string, string> = {
  a_fazer: "A fazer",
  pendente_aprovacao: "Enviou para aprovação",
  concluida: "Aprovada",
  rejeitada: "Rejeitada",
  dispensa_solicitada: "Pediu dispensa",
  arquivada: "Dispensa aceita",
  nao_feita: "Não feita",
};

function getEffectiveStatus(t: Tarefa): string {
  if (t.status === "a_fazer" && t.data_prevista) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const prevista = new Date(t.data_prevista + "T00:00:00");
    if (prevista < today) return "nao_feita";
  }
  return t.status;
}

interface TarefaHistoricoSheetProps {
  tarefa: Tarefa | null;
  onClose: () => void;
  getNomeUsuario: (userId: string | null) => string;
}

export function TarefaHistoricoSheet({ tarefa, onClose, getNomeUsuario }: TarefaHistoricoSheetProps) {
  const { data: interacoes, isLoading: loadingInteracoes } = useQuery({
    queryKey: ["tarefa-interacoes", tarefa?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tarefa_interacao")
        .select("*")
        .eq("tarefa_id", tarefa!.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as Interacao[];
    },
    enabled: !!tarefa,
  });

  if (!tarefa) return null;

  const t = tarefa;
  const effectiveStatus = getEffectiveStatus(t);
  const cfg = statusConfig[effectiveStatus] ?? statusConfig.a_fazer;
  const StatusIcon = cfg.icon;

  return (
    <Sheet open={!!tarefa} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-left">{t.nome}</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {/* Status & Value */}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={cfg.badgeVariant} className="gap-1">
              <StatusIcon className="h-3 w-3" />
              {cfg.label}
            </Badge>
            <Badge variant="outline" className={`gap-1 ${effectiveStatus === "arquivada" || effectiveStatus === "dispensa_solicitada" || effectiveStatus === "rejeitada" || effectiveStatus === "nao_feita" ? "line-through opacity-50" : ""}`}>
              <Coins className="h-3 w-3" />
              {t.valor_moedas} moedas
            </Badge>
            <Badge variant="outline">{categoriaLabels[t.categoria] ?? t.categoria}</Badge>
          </div>

          {t.descricao && (
            <p className="text-sm text-muted-foreground">{t.descricao}</p>
          )}

          <Separator />

          {/* Info grid */}
          <div className="space-y-3">
            <div className="flex items-start gap-2">
              <User className="h-4 w-4 mt-0.5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Atribuída a</p>
                <p className="text-sm font-medium">{getNomeUsuario(t.atribuida_a)}</p>
              </div>
            </div>

            <div className="flex items-start gap-2">
              <Calendar className="h-4 w-4 mt-0.5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Data prevista</p>
                <p className="text-sm font-medium">
                  {t.data_prevista ? format(new Date(t.data_prevista + "T00:00:00"), "dd 'de' MMMM 'de' yyyy", { locale: ptBR }) : "—"}
                </p>
              </div>
            </div>

            {t.data_conclusao && (
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 mt-0.5 text-success" />
                <div>
                  <p className="text-xs text-muted-foreground">Concluída em</p>
                  <p className="text-sm font-medium">
                    {format(new Date(t.data_conclusao), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </p>
                </div>
              </div>
            )}

            {t.data_aprovacao && (
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 mt-0.5 text-primary" />
                <div>
                  <p className="text-xs text-muted-foreground">
                    {t.status === "concluida" ? "Aprovada em" : t.status === "arquivada" ? "Dispensa aceita em" : "Decisão em"}
                  </p>
                  <p className="text-sm font-medium">
                    {format(new Date(t.data_aprovacao), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </p>
                </div>
              </div>
            )}

            <div className="flex items-start gap-2">
              <Clock className="h-4 w-4 mt-0.5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Criada em</p>
                <p className="text-sm font-medium">
                  {format(new Date(t.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                </p>
              </div>
            </div>
          </div>

          {/* Interaction History */}
          <Separator />
          <div className="space-y-3">
            <h4 className="text-sm font-semibold flex items-center gap-1.5">
              <MessageSquare className="h-4 w-4" /> Histórico de Interações
            </h4>

            {loadingInteracoes ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : interacoes && interacoes.length > 0 ? (
              <div className="space-y-3">
                {interacoes.map((inter) => (
                  <div key={inter.id} className="rounded-lg bg-muted p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-muted-foreground">
                        {getNomeUsuario(inter.user_id)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {format(new Date(inter.created_at), "dd/MM HH:mm")}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground/80">
                      {statusLabels[inter.status_novo] ?? inter.status_novo}
                    </p>
                    {inter.mensagem && (
                      <p className="text-sm">💬 {inter.mensagem}</p>
                    )}
                    {inter.foto_url && (
                      <div className="mt-1">
                        <a href={inter.foto_url} target="_blank" rel="noopener noreferrer">
                          <img
                            src={inter.foto_url}
                            alt="Foto da interação"
                            className="h-32 w-auto rounded-md object-cover border cursor-pointer hover:opacity-80 transition-opacity"
                          />
                        </a>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              // Fallback to legacy messages if no interacoes exist
              <>
                {(t.justificativa || t.comentario_responsavel) ? (
                  <div className="space-y-3">
                    {t.justificativa && (
                      <div className="rounded-lg bg-muted p-3">
                        <p className="text-xs font-medium text-muted-foreground mb-1">
                          {getNomeUsuario(t.atribuida_a)} {t.status === "dispensa_solicitada" || t.status === "arquivada" ? "(pedido de dispensa)" : "(conclusão)"}
                        </p>
                        <p className="text-sm">{t.justificativa}</p>
                      </div>
                    )}
                    {t.comentario_responsavel && (
                      <div className="rounded-lg bg-primary/10 p-3">
                        <p className="text-xs font-medium text-primary mb-1">Responsável (feedback)</p>
                        <p className="text-sm">{t.comentario_responsavel}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic">Nenhuma interação registrada.</p>
                )}
              </>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
