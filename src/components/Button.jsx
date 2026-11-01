import { Link } from 'react-router-dom';

const VARIANT_CLASSES = {
  default: 'btn-outline-secondary',
  primary: 'btn-primary',
  danger: 'btn-outline-danger',
  'danger-solid': 'btn-danger',
  ghost: 'btn-link',
};

const classes = (variant, size, className) =>
  ['btn', VARIANT_CLASSES[variant] ?? VARIANT_CLASSES.default, size === 'small' && 'btn-sm', className]
    .filter(Boolean)
    .join(' ');

/** Bootstrap button. variant: 'default' | 'primary' | 'danger' | 'danger-solid' | 'ghost'; size: 'medium' | 'small'. */
export function Button({ variant = 'default', size = 'medium', type = 'button', className, ...props }) {
  return <button type={type} className={classes(variant, size, className)} {...props} />;
}

/** A router link that looks like a button. */
export function ButtonLink({ variant = 'default', size = 'medium', className, ...props }) {
  return <Link className={classes(variant, size, className)} {...props} />;
}
