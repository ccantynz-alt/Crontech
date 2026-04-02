import { Title } from "@solidjs/meta";
import { Button } from "@back-to-the-future/ui";

export default function Home() {
  return (
    <main class="container">
      <Title>Back to the Future</Title>
      <div class="hero">
        <h1 class="heading">Back to the Future</h1>
        <p class="tagline">The most advanced full-stack platform</p>
        <p class="description">
          AI-native. Edge-first. Zero-HTML. Self-evolving.
        </p>
        <Button>Get Started</Button>
      </div>
    </main>
  );
}
