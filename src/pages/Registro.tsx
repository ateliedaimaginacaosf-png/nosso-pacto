import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import { UserPlus, Crown, CheckCircle, ExternalLink } from "lucide-react";
import logoImg from "@/assets/logo.png";
import { Badge } from "@/components/ui/badge";

export default function Registro() {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast({ variant: "destructive", title: "As senhas não coincidem" });
      return;
    }

    if (password.length < 6) {
      toast({ variant: "destructive", title: "A senha deve ter pelo menos 6 caracteres" });
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: {
          nome,
          tipo_perfil: "responsavel",
        },
      },
    });

    if (error) {
      toast({ variant: "destructive", title: "Erro ao criar conta", description: error.message });
    } else {
      toast({
        title: "Conta criada com sucesso! 🎉",
        description: "Verifique seu email e conclua a assinatura para ativar o acesso.",
      });
      // Redirect to Hotmart checkout with email pre-filled
      const hotmartUrl = `https://pay.hotmart.com/J104574686C?email=${encodeURIComponent(email)}`;
      window.location.href = hotmartUrl;
    }

    setLoading(false);
  };

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
          <p className="mt-1 text-muted-foreground">Crie o pacto da sua família 🤝</p>
        </div>

        {/* Plano */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.4 }}
          className="mb-4"
        >
          <Card className="border-2 border-primary/30 bg-primary/5 shadow-md">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Crown className="h-5 w-5 text-primary" />
                  <span className="font-display font-bold text-lg text-foreground">Plano Essencial</span>
                </div>
                <Badge variant="secondary" className="text-xs">Mensal</Badge>
              </div>
              <div className="flex items-baseline gap-1 mb-3">
                <span className="text-3xl font-bold text-foreground">R$ 29,90</span>
                <span className="text-muted-foreground text-sm">/mês</span>
              </div>
              <div className="space-y-2 text-sm text-muted-foreground">
                <div className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <span><strong className="text-foreground">30 dias grátis</strong> para testar — a cobrança só começa depois</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <span>Cancele a qualquer momento, sem compromisso</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <span>Após o cadastro, você será redirecionado para a página de pagamento</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <Card className="border-2 shadow-lg">
          <CardHeader>
            <CardTitle className="font-display text-xl">Criar Conta</CardTitle>
            <CardDescription>Cadastre-se como responsável para começar</CardDescription>
          </CardHeader>
          <form onSubmit={handleRegister}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nome">Seu nome</Label>
                <Input
                  id="nome"
                  placeholder="Ex: Maria Silva"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Mínimo 6 caracteres"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirmar senha</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Repita a senha"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-3">
              <Button type="submit" className="w-full gap-2" disabled={loading}>
                <UserPlus className="h-4 w-4" />
                {loading ? "Criando conta..." : "Criar conta e assinar"}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Ao criar sua conta, você será redirecionado para o pagamento na Hotmart.
              </p>
              <p className="text-center text-sm text-muted-foreground">
                Já tem conta?{" "}
                <Link to="/login" className="font-semibold text-primary hover:underline">
                  Entrar
                </Link>
              </p>
            </CardFooter>
          </form>
        </Card>
      </motion.div>
    </div>
  );
}
