import { Title } from "@solidjs/meta";
import { Button } from "@back-to-the-future/ui";

export default function Home() {
  return (
    <main class="mx-auto max-w-7xl px-8 py-8">
      <Title>Back to the Future</Title>
      <div class="flex min-h-[80vh] flex-col items-center justify-center gap-4 text-center">
        <h1 class="text-6xl font-extrabold leading-tight tracking-tight text-gray-950">
          Back to the Future
        </h1>
        <p class="text-2xl font-medium text-gray-600">
          The most advanced full-stack platform
        </p>
        <p class="max-w-xl text-lg text-gray-500">
          AI-native. Edge-first. Zero-HTML. Self-evolving.
        </p>
        <Button>Get Started</Button>
      </div>
    </main>
  );
}
