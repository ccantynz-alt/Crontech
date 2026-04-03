import type { Meta, StoryObj } from "storybook-solidjs";
import { Avatar } from "../index";

const meta: Meta<typeof Avatar> = {
  title: "Components/Avatar",
  component: Avatar,
  tags: ["autodocs"],
  argTypes: {
    src: { control: "text" },
    alt: { control: "text" },
    initials: { control: "text" },
    size: { control: "select", options: ["sm", "md", "lg"] },
  },
};

export default meta;
type Story = StoryObj<typeof Avatar>;

export const Default: Story = {
  args: {
    initials: "JD",
    alt: "John Doe",
  },
};

export const WithImage: Story = {
  args: {
    src: "https://i.pravatar.cc/150?u=avatar-story",
    alt: "Jane Smith",
  },
};

export const WithInitials: Story = {
  args: {
    initials: "AB",
    alt: "Alice Brown",
  },
};

export const Small: Story = {
  args: {
    initials: "SM",
    size: "sm",
    alt: "Small avatar",
  },
};

export const Large: Story = {
  args: {
    initials: "LG",
    size: "lg",
    alt: "Large avatar",
  },
};
