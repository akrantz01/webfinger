export interface Link {
	rel: string;
	href: string;
}

export interface ResponseBody {
  subject: string;
  links: Link[];
}

export interface Resource {
	scheme: string;
	name: string;
}
