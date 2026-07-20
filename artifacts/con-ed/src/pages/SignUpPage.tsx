import { SignUp } from "@clerk/react";
import logo from "@assets/oss-logo-white.png";
import ptBg from "@assets/pt-login-bg.png";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen w-full bg-slate-50">
      <div className="flex flex-1 flex-col items-center justify-center p-6">
        <div className="w-full max-w-[400px]">
          <SignUp
            routing="path"
            path={`${basePath}/sign-up`}
            signInUrl={`${basePath}/sign-in`}
            forceRedirectUrl={`${basePath}/dashboard`}
            appearance={{
              elements: {
                rootBox: "w-full mx-auto",
                card: "rounded-xl shadow-lg border border-slate-100",
                headerTitle: "font-serif text-2xl text-slate-900",
                headerSubtitle: "text-slate-500",
                primaryButton: "bg-primary hover:bg-primary/90 text-white shadow-sm font-medium",
              },
            }}
          />
        </div>
      </div>

      <div className="hidden flex-1 bg-secondary flex-col items-center justify-center lg:flex p-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-30 bg-cover bg-center" style={{ backgroundImage: `url(${ptBg})` }}></div>
        <div className="relative z-10 max-w-md text-center">
          <img src={logo} alt="OSS Logo" className="h-16 mx-auto mb-8" />
          <h1 className="text-4xl font-serif font-bold text-white mb-4">Continuing Education Portal</h1>
          <p className="text-secondary-foreground/80 text-lg">
            Invest in your professional growth. Manage your continuing education funding requests and reimbursements.
          </p>
        </div>
      </div>
    </div>
  );
}
