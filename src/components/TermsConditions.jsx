import PolicyDocument from './UI/PolicyDocument';
// The text lives in content/ so the site and the support chatbot share one source
import source from '../../content/terms-and-conditions.md?raw';

export default function TermsConditions() {
  return <PolicyDocument source={source} />;
}
