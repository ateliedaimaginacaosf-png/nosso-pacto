import { motion } from "framer-motion";
import { Lock, LogOut } from "lucide-react";
import logoImg from "@/assets/logo.png";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";

export default function AcessoPendente() {
  const { signOut, user } = useAuth();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <div className="mb-8 text-center">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            className="mx-auto mb-4 flex h-16 w-16 items-center justify-center"
          >
            <img src={logoImg} alt="Nosso Pacto" className="h-16 w-16 rounded-2xl object-cover" />
          </motion.div>
          <h1 className="font-display text-3xl font-bold text-foreground">Nosso Pacto</h1>
        </div>

        <Card className="border-2 shadow-lg">
          <CardHeader className="text-center">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.3, type: "spring" }}
              className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-muted"
            >
              <Lock className="h-6 w-6 text-muted-foreground" />
            </motion.div>
            <CardTitle className="font-display text-xl">Acesso Pendente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-center">
            <p className="text-muted-foreground">
              Sua conta foi criada com sucesso! Para liberar o acesso completo ao
              <strong> Nosso Pacto</strong>, é necessário concluir o pagamento.
            </p>
            <p className="text-sm text-muted-foreground">
              Após a confirmação do pagamento, seu acesso será liberado automaticamente.
              {user?.email && (
                <span className="mt-1 block text-xs">
                  Conta: <strong>{user.email}</strong>
                </span>
              )}
            </p>
            <div className="pt-2">
              <Button variant="outline" className="w-full gap-2" onClick={signOut}>
                <LogOut className="h-4 w-4" />
                Sair
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
