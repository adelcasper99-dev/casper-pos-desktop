# Kilo Configuration

## MCP Auto-Detection Rules

Automatically detect and use MCP tools when relevant **without explicit instruction**:

### 1. `context7` - Library/Framework Documentation
Use for: React, Node.js, Express, Angular, Vue, Next.js, Tailwind, etc.
- Keywords: "how to", "example", "documentation", library names
- Trigger: Any question about third-party libraries/frameworks

### 2. `microsoft-learn` - Microsoft Technologies
Use for: .NET, C#, ASP.NET, Azure, Microsoft 365, TypeScript, SQL Server, etc.
- Keywords: "azure", ".NET", "C#", "asp.net", "microsoft", "sql server", "typescript"
- Trigger: Any question about Microsoft technologies

### 3. `microsoft-learn_microsoft_code_sample_search` - Code Examples
Use for: Getting code snippets and examples
- Trigger: When user asks for code examples

### 4. `sequentialthinking` - Complex Problem Solving
Use for: Debugging, architecture decisions, complex bugs, multi-step problems
- Trigger: When problem has multiple causes or unclear root cause

### 5. `memory` - Knowledge Graph
Use for: Remembering project-specific info, user preferences
- Trigger: When referring to previous conversation context

### 6. `playwright` - Browser Testing
Use for: Testing web pages, taking screenshots, automation
- Trigger: When testing UI or browser interactions

## Auto-Detection Logic

```
IF question contains "azure" OR ".NET" OR "C#" OR "microsoft" OR "sql server"
    → use microsoft-learn MCP

IF question mentions React/Node/Angular/Vue/Tailwind/Next.js
    → use context7 MCP

IF question asks for code example/sample
    → use code_sample_search MCP

IF problem is complex with multiple possible causes
    → use sequentialthinking MCP
```

## Project Context
- TypeScript/React POS application
- Angular components in src/
- Use Microsoft Learn for .NET/TypeScript questions
- Use Context7 for React/Node.js questions