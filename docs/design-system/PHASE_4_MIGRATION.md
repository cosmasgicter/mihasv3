# Phase 4 Migration Guide: Layout Components

## Container Component

### Replace max-width divs

**Before:**
```tsx
<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
  <h1>Content</h1>
</div>
```

**After:**
```tsx
<Container size="lg">
  <h1>Content</h1>
</Container>
```

## Stack Component

### Replace flex layouts

**Before:**
```tsx
<div className="flex flex-col gap-4 items-center">
  <Button>Action 1</Button>
  <Button>Action 2</Button>
</div>
```

**After:**
```tsx
<Stack spacing="md" align="center">
  <Button>Action 1</Button>
  <Button>Action 2</Button>
</Stack>
```

### Horizontal stack

**Before:**
```tsx
<div className="flex flex-row gap-2 justify-between">
  <span>Label</span>
  <Badge>Status</Badge>
</div>
```

**After:**
```tsx
<Stack direction="horizontal" spacing="sm" justify="between">
  <span>Label</span>
  <Badge>Status</Badge>
</Stack>
```

## Section Component

### Replace section wrappers

**Before:**
```tsx
<section className="py-16 bg-gradient-to-b from-background to-primary/5">
  <div className="max-w-7xl mx-auto px-4">
    <h2>Section Title</h2>
  </div>
</section>
```

**After:**
```tsx
<Section spacing="lg" background="gradient">
  <Container>
    <h2>Section Title</h2>
  </Container>
</Section>
```

## Grid Component

### Replace grid layouts

**Before:**
```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
  <Card>Item 1</Card>
  <Card>Item 2</Card>
  <Card>Item 3</Card>
</div>
```

**After:**
```tsx
<Grid cols={3} gap="lg">
  <Card>Item 1</Card>
  <Card>Item 2</Card>
  <Card>Item 3</Card>
</Grid>
```

## Common Patterns

### Page Layout
```tsx
<Section spacing="xl" background="gradient">
  <Container size="lg">
    <Stack spacing="lg">
      <h1>Page Title</h1>
      <Grid cols={3} gap="lg">
        <Card>Feature 1</Card>
        <Card>Feature 2</Card>
        <Card>Feature 3</Card>
      </Grid>
    </Stack>
  </Container>
</Section>
```

### Dashboard Layout
```tsx
<Container size="xl">
  <Stack spacing="xl">
    <Stack direction="horizontal" justify="between" align="center">
      <h1>Dashboard</h1>
      <Button>Action</Button>
    </Stack>
    <Grid cols={4} gap="md">
      <Card>Metric 1</Card>
      <Card>Metric 2</Card>
      <Card>Metric 3</Card>
      <Card>Metric 4</Card>
    </Grid>
  </Stack>
</Container>
```

### Form Layout
```tsx
<Container size="sm">
  <Card>
    <CardHeader>
      <CardTitle>Form Title</CardTitle>
    </CardHeader>
    <CardContent>
      <Stack spacing="md">
        <Input label="Name" />
        <Input label="Email" />
        <Stack direction="horizontal" spacing="sm" justify="end">
          <Button variant="outline">Cancel</Button>
          <Button variant="primary">Submit</Button>
        </Stack>
      </Stack>
    </CardContent>
  </Card>
</Container>
```
