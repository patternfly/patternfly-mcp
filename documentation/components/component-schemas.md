# Component Schemas Tool

The `component-schemas` tool provides access to PatternFly component JSON schemas for validation and documentation purposes. This tool integrates the [@patternfly/patternfly-component-schemas](https://github.com/patternfly/patternfly-component-schemas) package to give you structured metadata about all PatternFly React components.

## Features

- **List all components**: Get a complete list of all 462+ PatternFly components
- **Search components**: Find components with fuzzy matching on their names.
- **Get component schema**: Retrieve detailed JSON Schema for any specific component
- **Prop validation**: Access structured validation rules for component props
- **AI-friendly**: Designed for AI assistants and code generation tools

## Usage

### List All Components

```json
{
  "action": "list"
}
```

### Search Components

```json
{
  "action": "search",
  "query": "button"
}
```

### Get Component Schema

```json
{
  "action": "get",
  "componentName": "Button"
}
```
