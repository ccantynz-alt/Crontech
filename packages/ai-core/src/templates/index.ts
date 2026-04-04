// ── Site Templates ──────────────────────────────────────────────────
// Pre-built PageLayout templates for quick-start site creation.
// Users can pick a template and customize via AI chat.

import type { PageLayout } from "../agents/site-builder";

export interface SiteTemplate {
  id: string;
  name: string;
  description: string;
  category: "landing" | "portfolio" | "business" | "blog" | "saas" | "minimal";
  layout: PageLayout;
}

// ── Landing Page Template ───────────────────────────────────────────

const landingPage: SiteTemplate = {
  id: "landing-page",
  name: "Landing Page",
  description: "A clean landing page with hero section, features grid, and call to action.",
  category: "landing",
  layout: {
    title: "Landing Page",
    description: "A modern landing page with hero, features, and CTA",
    components: [
      {
        component: "Stack",
        props: { direction: "vertical", gap: "xl", align: "stretch", justify: "start" },
        children: [
          // Hero Section
          {
            component: "Stack",
            props: { direction: "vertical", gap: "md", align: "center", justify: "center" },
            children: [
              { component: "Text", props: { content: "Build Something Amazing", variant: "h1", weight: "bold", align: "center" } },
              { component: "Text", props: { content: "The fastest way to go from idea to production. AI-powered, edge-deployed, zero-config.", variant: "body", weight: "normal", align: "center" } },
              {
                component: "Stack",
                props: { direction: "horizontal", gap: "md", align: "center", justify: "center" },
                children: [
                  { component: "Button", props: { variant: "primary", size: "lg", disabled: false, loading: false, label: "Get Started Free" } },
                  { component: "Button", props: { variant: "outline", size: "lg", disabled: false, loading: false, label: "View Demo" } },
                ],
              },
            ],
          },
          { component: "Separator", props: { orientation: "horizontal" } },
          // Features Section
          { component: "Text", props: { content: "Why Choose Us", variant: "h2", weight: "semibold", align: "center" } },
          {
            component: "Stack",
            props: { direction: "horizontal", gap: "lg", align: "stretch", justify: "center" },
            children: [
              {
                component: "Card",
                props: { title: "Lightning Fast", description: "Sub-second load times powered by edge computing.", padding: "md" },
                children: [
                  { component: "Badge", props: { variant: "success", size: "sm", label: "< 100ms" } },
                ],
              },
              {
                component: "Card",
                props: { title: "AI-Powered", description: "Build and iterate with natural language instructions.", padding: "md" },
                children: [
                  { component: "Badge", props: { variant: "info", size: "sm", label: "GPT-4 class" } },
                ],
              },
              {
                component: "Card",
                props: { title: "Secure by Default", description: "Passkey auth, encryption, zero-trust architecture.", padding: "md" },
                children: [
                  { component: "Badge", props: { variant: "success", size: "sm", label: "SOC 2" } },
                ],
              },
            ],
          },
          { component: "Separator", props: { orientation: "horizontal" } },
          // CTA Section
          {
            component: "Card",
            props: { title: "Ready to Start?", description: "Join thousands of developers building the future.", padding: "lg" },
            children: [
              {
                component: "Stack",
                props: { direction: "horizontal", gap: "sm", align: "center", justify: "start" },
                children: [
                  { component: "Input", props: { type: "email", placeholder: "Enter your email", name: "email" } },
                  { component: "Button", props: { variant: "primary", size: "md", disabled: false, loading: false, label: "Sign Up" } },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
};

// ── Portfolio Template ──────────────────────────────────────────────

const portfolio: SiteTemplate = {
  id: "portfolio",
  name: "Portfolio",
  description: "A personal portfolio showcasing your work, skills, and contact info.",
  category: "portfolio",
  layout: {
    title: "Portfolio",
    description: "Personal portfolio with about, projects, and contact sections",
    components: [
      {
        component: "Stack",
        props: { direction: "vertical", gap: "xl", align: "stretch", justify: "start" },
        children: [
          // About Section
          {
            component: "Stack",
            props: { direction: "horizontal", gap: "lg", align: "center", justify: "start" },
            children: [
              { component: "Avatar", props: { initials: "JD", size: "lg" } },
              {
                component: "Stack",
                props: { direction: "vertical", gap: "xs", align: "start", justify: "start" },
                children: [
                  { component: "Text", props: { content: "Jane Doe", variant: "h1", weight: "bold", align: "left" } },
                  { component: "Text", props: { content: "Full-Stack Developer & Designer", variant: "body", weight: "normal", align: "left" } },
                  {
                    component: "Stack",
                    props: { direction: "horizontal", gap: "xs", align: "center", justify: "start" },
                    children: [
                      { component: "Badge", props: { variant: "info", size: "sm", label: "React" } },
                      { component: "Badge", props: { variant: "info", size: "sm", label: "TypeScript" } },
                      { component: "Badge", props: { variant: "info", size: "sm", label: "Node.js" } },
                    ],
                  },
                ],
              },
            ],
          },
          { component: "Separator", props: { orientation: "horizontal" } },
          // Projects
          { component: "Text", props: { content: "Featured Projects", variant: "h2", weight: "semibold", align: "left" } },
          {
            component: "Stack",
            props: { direction: "horizontal", gap: "md", align: "stretch", justify: "start" },
            children: [
              {
                component: "Card",
                props: { title: "Project Alpha", description: "A real-time collaboration platform built with WebSockets.", padding: "md" },
                children: [
                  { component: "Button", props: { variant: "link", size: "sm", disabled: false, loading: false, label: "View Project" } },
                ],
              },
              {
                component: "Card",
                props: { title: "Project Beta", description: "AI-powered content management system with semantic search.", padding: "md" },
                children: [
                  { component: "Button", props: { variant: "link", size: "sm", disabled: false, loading: false, label: "View Project" } },
                ],
              },
            ],
          },
          { component: "Separator", props: { orientation: "horizontal" } },
          // Contact
          { component: "Text", props: { content: "Get In Touch", variant: "h2", weight: "semibold", align: "left" } },
          {
            component: "Card",
            props: { padding: "md" },
            children: [
              {
                component: "Stack",
                props: { direction: "vertical", gap: "sm", align: "stretch", justify: "start" },
                children: [
                  { component: "Input", props: { type: "text", placeholder: "Your name", label: "Name", name: "name", required: true } },
                  { component: "Input", props: { type: "email", placeholder: "your@email.com", label: "Email", name: "email", required: true } },
                  { component: "Textarea", props: { placeholder: "Tell me about your project...", label: "Message", name: "message", rows: 4 } },
                  { component: "Button", props: { variant: "primary", size: "md", disabled: false, loading: false, label: "Send Message" } },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
};

// ── SaaS Dashboard Template ─────────────────────────────────────────

const saasDashboard: SiteTemplate = {
  id: "saas-dashboard",
  name: "SaaS Dashboard",
  description: "A clean SaaS dashboard with metrics, data table, and navigation tabs.",
  category: "saas",
  layout: {
    title: "SaaS Dashboard",
    description: "Analytics dashboard with KPIs, charts placeholder, and data management",
    components: [
      {
        component: "Stack",
        props: { direction: "vertical", gap: "lg", align: "stretch", justify: "start" },
        children: [
          // Header
          {
            component: "Stack",
            props: { direction: "horizontal", gap: "md", align: "center", justify: "between" },
            children: [
              { component: "Text", props: { content: "Dashboard", variant: "h1", weight: "bold", align: "left" } },
              { component: "Button", props: { variant: "primary", size: "sm", disabled: false, loading: false, label: "Export Report" } },
            ],
          },
          // KPI Cards
          {
            component: "Stack",
            props: { direction: "horizontal", gap: "md", align: "stretch", justify: "start" },
            children: [
              {
                component: "Card",
                props: { padding: "md" },
                children: [
                  {
                    component: "Stack",
                    props: { direction: "vertical", gap: "xs", align: "start", justify: "start" },
                    children: [
                      { component: "Text", props: { content: "Total Revenue", variant: "caption", weight: "medium", align: "left" } },
                      { component: "Text", props: { content: "$45,231.89", variant: "h2", weight: "bold", align: "left" } },
                      { component: "Badge", props: { variant: "success", size: "sm", label: "+20.1% from last month" } },
                    ],
                  },
                ],
              },
              {
                component: "Card",
                props: { padding: "md" },
                children: [
                  {
                    component: "Stack",
                    props: { direction: "vertical", gap: "xs", align: "start", justify: "start" },
                    children: [
                      { component: "Text", props: { content: "Active Users", variant: "caption", weight: "medium", align: "left" } },
                      { component: "Text", props: { content: "2,350", variant: "h2", weight: "bold", align: "left" } },
                      { component: "Badge", props: { variant: "success", size: "sm", label: "+180 this week" } },
                    ],
                  },
                ],
              },
              {
                component: "Card",
                props: { padding: "md" },
                children: [
                  {
                    component: "Stack",
                    props: { direction: "vertical", gap: "xs", align: "start", justify: "start" },
                    children: [
                      { component: "Text", props: { content: "Conversion Rate", variant: "caption", weight: "medium", align: "left" } },
                      { component: "Text", props: { content: "3.2%", variant: "h2", weight: "bold", align: "left" } },
                      { component: "Badge", props: { variant: "warning", size: "sm", label: "-0.4% from last month" } },
                    ],
                  },
                ],
              },
            ],
          },
          // Tabs
          {
            component: "Tabs",
            props: {
              items: [
                { id: "overview", label: "Overview" },
                { id: "analytics", label: "Analytics" },
                { id: "reports", label: "Reports" },
                { id: "notifications", label: "Notifications" },
              ],
              defaultTab: "overview",
            },
          },
          // Alert
          {
            component: "Alert",
            props: { variant: "info", title: "New Feature", description: "AI-powered insights are now available. Check the Analytics tab." },
          },
        ],
      },
    ],
  },
};

// ── Minimal Template ────────────────────────────────────────────────

const minimal: SiteTemplate = {
  id: "minimal",
  name: "Minimal",
  description: "A dead-simple single page with a heading, text, and a button.",
  category: "minimal",
  layout: {
    title: "Minimal Site",
    description: "A clean, minimal single page",
    components: [
      {
        component: "Stack",
        props: { direction: "vertical", gap: "lg", align: "center", justify: "center" },
        children: [
          { component: "Text", props: { content: "Hello, World", variant: "h1", weight: "bold", align: "center" } },
          { component: "Text", props: { content: "This is your site. Make it yours.", variant: "body", weight: "normal", align: "center" } },
          { component: "Button", props: { variant: "primary", size: "lg", disabled: false, loading: false, label: "Get Started" } },
        ],
      },
    ],
  },
};

// ── Blog Template ──────────────────────────────────────────────────

const blog: SiteTemplate = {
  id: "blog",
  name: "Blog",
  description: "A blog layout with featured post, recent articles, and newsletter signup.",
  category: "blog",
  layout: {
    title: "Blog",
    description: "Blog with featured post, recent posts grid, and newsletter signup",
    components: [
      {
        component: "Stack",
        props: { direction: "vertical", gap: "xl", align: "stretch", justify: "start" },
        children: [
          // Blog Header
          {
            component: "Stack",
            props: { direction: "vertical", gap: "sm", align: "center", justify: "center" },
            children: [
              { component: "Text", props: { content: "My Blog", variant: "h1", weight: "bold", align: "center" } },
              { component: "Text", props: { content: "Thoughts on technology, design, and building for the web.", variant: "body", weight: "normal", align: "center" } },
            ],
          },
          { component: "Separator", props: { orientation: "horizontal" } },
          // Featured Post
          { component: "Text", props: { content: "Featured Post", variant: "h2", weight: "semibold", align: "left" } },
          {
            component: "Card",
            props: { title: "The Future of AI-Native Development", description: "How AI is reshaping the way we build software — from code generation to autonomous agents that ship features while you sleep.", padding: "lg" },
            children: [
              {
                component: "Stack",
                props: { direction: "horizontal", gap: "sm", align: "center", justify: "start" },
                children: [
                  { component: "Badge", props: { variant: "info", size: "sm", label: "April 1, 2026" } },
                  { component: "Button", props: { variant: "primary", size: "md", disabled: false, loading: false, label: "Read More" } },
                ],
              },
            ],
          },
          { component: "Separator", props: { orientation: "horizontal" } },
          // Recent Posts
          { component: "Text", props: { content: "Recent Posts", variant: "h2", weight: "semibold", align: "left" } },
          {
            component: "Stack",
            props: { direction: "horizontal", gap: "md", align: "stretch", justify: "start" },
            children: [
              {
                component: "Card",
                props: { title: "Edge Computing in 2026", description: "Why moving compute closer to users changes everything about application architecture.", padding: "md" },
                children: [
                  { component: "Badge", props: { variant: "info", size: "sm", label: "March 25, 2026" } },
                ],
              },
              {
                component: "Card",
                props: { title: "WebGPU: Beyond Graphics", description: "Using the GPU for AI inference, physics simulations, and real-time data processing in the browser.", padding: "md" },
                children: [
                  { component: "Badge", props: { variant: "info", size: "sm", label: "March 18, 2026" } },
                ],
              },
              {
                component: "Card",
                props: { title: "Zero-HTML Component Systems", description: "Why writing HTML by hand is over and what comes next for UI development.", padding: "md" },
                children: [
                  { component: "Badge", props: { variant: "info", size: "sm", label: "March 10, 2026" } },
                ],
              },
            ],
          },
          { component: "Separator", props: { orientation: "horizontal" } },
          // Newsletter Signup
          { component: "Text", props: { content: "Stay Updated", variant: "h2", weight: "semibold", align: "center" } },
          {
            component: "Card",
            props: { title: "Subscribe to the Newsletter", description: "Get the latest posts delivered straight to your inbox. No spam, ever.", padding: "md" },
            children: [
              {
                component: "Stack",
                props: { direction: "horizontal", gap: "sm", align: "center", justify: "start" },
                children: [
                  { component: "Input", props: { type: "email", placeholder: "you@example.com", name: "email" } },
                  { component: "Button", props: { variant: "primary", size: "md", disabled: false, loading: false, label: "Subscribe" } },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
};

// ── Business Template ──────────────────────────────────────────────

const business: SiteTemplate = {
  id: "business",
  name: "Business",
  description: "A professional business site with services, testimonials, and contact form.",
  category: "business",
  layout: {
    title: "Business",
    description: "Business site with services, testimonials, and contact sections",
    components: [
      {
        component: "Stack",
        props: { direction: "vertical", gap: "xl", align: "stretch", justify: "start" },
        children: [
          // Company Header
          {
            component: "Stack",
            props: { direction: "vertical", gap: "md", align: "center", justify: "center" },
            children: [
              { component: "Text", props: { content: "Acme Corporation", variant: "h1", weight: "bold", align: "center" } },
              { component: "Text", props: { content: "Enterprise solutions that scale with your ambition.", variant: "body", weight: "normal", align: "center" } },
              {
                component: "Stack",
                props: { direction: "horizontal", gap: "md", align: "center", justify: "center" },
                children: [
                  { component: "Button", props: { variant: "primary", size: "lg", disabled: false, loading: false, label: "Contact Us" } },
                  { component: "Button", props: { variant: "outline", size: "lg", disabled: false, loading: false, label: "Learn More" } },
                ],
              },
            ],
          },
          { component: "Separator", props: { orientation: "horizontal" } },
          // Services Section
          { component: "Text", props: { content: "Our Services", variant: "h2", weight: "semibold", align: "center" } },
          {
            component: "Stack",
            props: { direction: "horizontal", gap: "md", align: "stretch", justify: "center" },
            children: [
              {
                component: "Card",
                props: { title: "Cloud Infrastructure", description: "Scalable, secure cloud architecture designed for high availability and peak performance.", padding: "md" },
                children: [
                  { component: "Badge", props: { variant: "success", size: "sm", label: "99.99% Uptime" } },
                ],
              },
              {
                component: "Card",
                props: { title: "AI Integration", description: "Embed intelligent automation into your workflows with custom-trained models and agents.", padding: "md" },
                children: [
                  { component: "Badge", props: { variant: "info", size: "sm", label: "Enterprise AI" } },
                ],
              },
              {
                component: "Card",
                props: { title: "Security & Compliance", description: "End-to-end encryption, audit trails, and regulatory compliance for every industry.", padding: "md" },
                children: [
                  { component: "Badge", props: { variant: "warning", size: "sm", label: "SOC 2 Type II" } },
                ],
              },
            ],
          },
          { component: "Separator", props: { orientation: "horizontal" } },
          // Testimonial Section
          { component: "Text", props: { content: "What Our Clients Say", variant: "h2", weight: "semibold", align: "center" } },
          {
            component: "Card",
            props: { padding: "lg" },
            children: [
              {
                component: "Stack",
                props: { direction: "vertical", gap: "md", align: "center", justify: "center" },
                children: [
                  { component: "Text", props: { content: "\"Acme transformed our infrastructure overnight. We cut costs by 40% and tripled our throughput. The team is world-class.\"", variant: "body", weight: "normal", align: "center" } },
                  {
                    component: "Stack",
                    props: { direction: "horizontal", gap: "sm", align: "center", justify: "center" },
                    children: [
                      { component: "Avatar", props: { initials: "SR", size: "md" } },
                      { component: "Text", props: { content: "Sarah Rodriguez, CTO at Initech", variant: "caption", weight: "medium", align: "left" } },
                    ],
                  },
                ],
              },
            ],
          },
          { component: "Separator", props: { orientation: "horizontal" } },
          // Contact Section
          { component: "Text", props: { content: "Get In Touch", variant: "h2", weight: "semibold", align: "center" } },
          {
            component: "Card",
            props: { padding: "md" },
            children: [
              {
                component: "Stack",
                props: { direction: "vertical", gap: "sm", align: "stretch", justify: "start" },
                children: [
                  { component: "Input", props: { type: "text", placeholder: "Your name", label: "Name", name: "name", required: true } },
                  { component: "Input", props: { type: "email", placeholder: "you@company.com", label: "Email", name: "email", required: true } },
                  { component: "Input", props: { type: "tel", placeholder: "+1 (555) 000-0000", label: "Phone", name: "phone" } },
                  { component: "Button", props: { variant: "primary", size: "md", disabled: false, loading: false, label: "Submit" } },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
};

// ── Template Registry ───────────────────────────────────────────────

export const SITE_TEMPLATES: SiteTemplate[] = [
  landingPage,
  portfolio,
  saasDashboard,
  minimal,
  blog,
  business,
];

export function getTemplate(id: string): SiteTemplate | undefined {
  return SITE_TEMPLATES.find((t) => t.id === id);
}

export function getTemplatesByCategory(category: SiteTemplate["category"]): SiteTemplate[] {
  return SITE_TEMPLATES.filter((t) => t.category === category);
}
