import SubscribeCard from '@/components/SubscribeCard';
export const metadata = { title: 'Smart TV subscription | Africin' };
export default function SubscriptionsPage() {
  return <main className="min-h-screen bg-background text-foreground pt-28 px-6 pb-16">
    <div className="max-w-xl mx-auto"><h1 className="text-3xl font-semibold">Watch Africin on your TV</h1>
      <p className="my-6 text-muted">Sign in with the same account you activated on your television. Standard includes 2 simultaneous streams and Premium includes 3, shared across mobile and TV. Mobile includes 1 stream and does not include Smart TV.</p>
      <SubscribeCard contentId="membership" manageForTv />
    </div>
  </main>;
}
