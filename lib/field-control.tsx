import { Children, cloneElement, isValidElement, type ReactNode } from 'react';

/** Associate a field's visible label with its first otherwise-unlabelled native control. */
export function labelFieldControl(children: ReactNode, id: string): ReactNode {
  let hasUnlabelled = false;
  function inspect(nodes: ReactNode) {
    Children.forEach(nodes, node => {
      if (!isValidElement<{ type?: string; children?: ReactNode; 'aria-label'?: string; 'aria-labelledby'?: string }>(node)) return;
      if (typeof node.type === 'string' && ['input', 'select', 'textarea'].includes(node.type)
        && node.props.type !== 'hidden' && !node.props['aria-label'] && !node.props['aria-labelledby']) hasUnlabelled = true;
      if (node.props.children) inspect(node.props.children);
    });
  }
  inspect(children);
  let assigned = false;
  function visit(nodes: ReactNode): ReactNode {
    return Children.map(nodes, node => {
      if (!isValidElement<{ id?: string; type?: string; children?: ReactNode; 'aria-label'?: string; 'aria-labelledby'?: string }>(node)) return node;
      if (!assigned && typeof node.type === 'string' && ['input', 'select', 'textarea'].includes(node.type)
        && node.props.type !== 'hidden' && (!hasUnlabelled || (!node.props['aria-label'] && !node.props['aria-labelledby']))) {
        assigned = true;
        return cloneElement(node, { id });
      }
      if (node.props.children) return cloneElement(node, { children: visit(node.props.children) });
      return node;
    });
  }
  return visit(children);
}
