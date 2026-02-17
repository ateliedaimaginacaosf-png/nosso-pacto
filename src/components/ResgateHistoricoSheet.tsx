import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Gift, Coins, Clock, CheckCircle2, XCircle, Ban, PackageCheck, MessageSquare, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type ResgateInteracao = {
  id: string;
  resgate_id: string;
  user_id: string;
  status_anterior: string | null;
  status_novo: string;
  mensagem: string | null;
  created_at: string;
};

const statusConfig: Record<string, { label: string; icon: typeof Clock; color: string; badgeVariant: "default" | "secondary" | "destructive" | "outline" }> = {
  pendente: { label: "Aguardando aprovação", icon: Clock, color: "text-yellow-600", badgeVariant: "secondary" },
  aprovada: { label: "Aprovada", icon: CheckCircle2, color: "text-success", badgeVariant: "default" },
  rejeitada: { label: "Rejeitada", icon: XCircle, color: "text-destructive", badgeVariant: "destructive" },
  cancelada: { label: "Cancelada", icon: Ban, color: "text-muted-foreground", badgeVariant: "outline" },
  cancelamento_solicitado: { label: "Cancelamento solicitado", icon: Clock, color: "text-orange-500", badgeVariant: "outline" },
  revertida: { label: "Revertida", icon: Ban, color: "text-muted-foreground", badgeVariant: "outline" },
  utilizada: { label: "Utilizada ✅", icon: PackageCheck, color: "text-success", badgeVariant: "default" },
};

const statusLabels: Record<string, string> = {
  pendente: "Solicitou resgate",
  aprovada: "Resgate aprovado",
  rejeitada: "Resgate rejeitado",
  cancelada: "Cancelado",
  cancelamento_solicitado: "Solicitou cancelamento",
  revertida: "Revertido",
  utilizada: "Marcou como utilizada",
};

interface ResgateHistoricoSheetProps {
  resgate: {
    id: string;
    status: string;
    custo_moedas: number;
    created_at: string;
    recompensa?: { nome: string } | null;
  } | null;
  onClose: () => void;
  getNomeUsuario: (userId: string) => string;
}

export function ResgateHistoricoSheet({ resgate, onClose, getNomeUsuario }: ResgateHistoricoSheetProps) {
  const { data: interacoes, isLoading } = useQuery({
    queryKey: ["resgate-interacoes", resgate?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("resgate_interacao")
        .select("*")
        .eq("resgate_id", resgate!.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as ResgateInteracao[];
    },
    enabled: !!resgate,
  });

  if (!resgate) return null;

  const cfg = statusConfig[resgate.status] ?? statusConfig.pendente;
  const StatusIcon = cfg.icon;
  const nomeRecompensa = (resgate.recompensa as any)?.nome ?? "Recompensa";

  return (
    <Sheet open={!!resgate} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-left">{nomeRecompensa}</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={cfg.badgeVariant} className={`gap-1 ${resgate.status === "cancelamento_solicitado" ? "border-orange-400 text-orange-600 bg-orange-50" : ""}`}>
              <StatusIcon className="h-3 w-3" />
              {cfg.label}
            </Badge>
            <Badge variant="outline" className="gap-1">
              <Coins className="h-3 w-3" />
              {resgate.custo_moedas} moedas
            </Badge>
          </div>

          <div className="flex items-start gap-2">
            <Clock className="h-4 w-4 mt-0.5 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Solicitado em</p>
              <p className="text-sm font-medium">
                {format(new Date(resgate.created_at), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}
              </p>
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <h4 className="text-sm font-semibold flex items-center gap-1.5">
              <MessageSquare className="h-4 w-4" /> Histórico
            </h4>

            {isLoading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : interacoes && interacoes.length > 0 ? (
              <div className="space-y-3">
                {interacoes.map((inter) => (
                  <div key={inter.id} className="rounded-lg bg-muted p-3 space-y-1">
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
                      <p className="text-sm mt-1">💬 {inter.mensagem}</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">Nenhuma interação registrada.</p>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
