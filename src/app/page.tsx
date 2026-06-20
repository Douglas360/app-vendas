import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Store,
  ShoppingCart,
  BarChart3,
  CreditCard,
  ArrowRight,
  Smartphone,
} from "lucide-react";

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Background */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 right-1/4 h-96 w-96 rounded-full bg-indigo-500/8 blur-3xl" />
        <div className="absolute top-1/3 -left-40 h-96 w-96 rounded-full bg-purple-500/8 blur-3xl" />
        <div className="absolute -bottom-40 right-0 h-96 w-96 rounded-full bg-indigo-500/5 blur-3xl" />
      </div>

      {/* Nav */}
      <header className="relative z-10 border-b bg-background/60 backdrop-blur-xl">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-md">
              <Store className="h-5 w-5 text-white" />
            </div>
            <span className="text-lg font-bold tracking-tight">VendaFácil</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost" size="sm">
                Entrar
              </Button>
            </Link>
            <Link href="/register">
              <Button
                size="sm"
                className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-md hover:from-indigo-600 hover:to-purple-700"
              >
                Criar Conta
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="relative z-10 flex-1">
        <section className="container mx-auto px-4 py-24 text-center lg:py-32">
          <div className="mx-auto max-w-3xl space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border bg-muted/50 px-4 py-1.5 text-sm text-muted-foreground backdrop-blur-sm">
              <Smartphone className="h-3.5 w-3.5" />
              <span>Instale como app no celular</span>
            </div>

            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
              Gestão de vendas
              <span className="bg-gradient-to-r from-indigo-500 to-purple-500 bg-clip-text text-transparent">
                {" "}
                simplificada
              </span>
            </h1>

            <p className="mx-auto max-w-xl text-lg text-muted-foreground leading-relaxed">
              Sistema completo de PDV, controle de estoque, cadastro de clientes
              e gestão de crediário. Tudo em um só lugar, acessível de qualquer
              dispositivo.
            </p>

            <div className="flex items-center justify-center gap-4 pt-4">
              <Link href="/register">
                <Button
                  size="lg"
                  className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg hover:from-indigo-600 hover:to-purple-700 hover:shadow-xl transition-all duration-300 gap-2"
                >
                  Começar Grátis
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/login">
                <Button variant="outline" size="lg">
                  Já tenho conta
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="container mx-auto px-4 pb-24">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: ShoppingCart,
                title: "PDV Completo",
                desc: "Frente de caixa rápida e intuitiva com suporte a múltiplas formas de pagamento.",
              },
              {
                icon: BarChart3,
                title: "Controle de Estoque",
                desc: "Acompanhe entradas, saídas e alertas de estoque baixo em tempo real.",
              },
              {
                icon: CreditCard,
                title: "Gestão de Fiado",
                desc: "Controle de crediário com parcelas, vencimentos e baixa de pagamentos.",
              },
              {
                icon: Smartphone,
                title: "PWA Mobile",
                desc: "Instale no celular e use como um app nativo, mesmo sem internet.",
              },
            ].map((feature) => (
              <div
                key={feature.title}
                className="group rounded-2xl border bg-card/50 p-6 backdrop-blur-sm transition-all duration-300 hover:bg-card hover:shadow-lg hover:-translate-y-1"
              >
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 text-indigo-500 transition-colors group-hover:from-indigo-500/20 group-hover:to-purple-500/20">
                  <feature.icon className="h-5 w-5" />
                </div>
                <h3 className="mb-2 font-semibold">{feature.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {feature.desc}
                </p>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t bg-background/60 backdrop-blur-xl">
        <div className="container mx-auto flex h-14 items-center justify-center px-4 text-sm text-muted-foreground">
          © {new Date().getFullYear()} VendaFácil. Todos os direitos reservados.
        </div>
      </footer>
    </div>
  );
}
