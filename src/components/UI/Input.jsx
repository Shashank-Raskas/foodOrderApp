export default function Input ({label, id, error, ...props}) {
    return (
        <p className="control">
            <label htmlFor={id}>{label}</label>
            <input 
                id={id} 
                name={id} 
                {...props} 
                className={error ? 'input-error' : ''}
            />
            {error && <span className="error-text">{error}</span>}
        </p>
    );
}