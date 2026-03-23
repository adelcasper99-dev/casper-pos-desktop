import { getSpareParts, getAllBrands } from "@/actions/spare-parts";
import { SparePartsSearch } from "@/components/spare-parts/SparePartsSearch";
import { getTranslations } from "@/lib/i18n-mock";

export default async function SparePartsPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const search = typeof searchParams.search === "string" ? searchParams.search : undefined;
  const brand = typeof searchParams.brand === "string" ? searchParams.brand : undefined;
  const page = typeof searchParams.page === "string" ? parseInt(searchParams.page) : 1;

  const [partsRes, brandsRes] = await Promise.all([
    getSpareParts({ search, brand, page }),
    getAllBrands(),
  ]);

  const parts = partsRes?.parts || [];
  const meta = partsRes?.meta || { total: 0, page: 1, limit: 50, totalPages: 0 };
  const brands = brandsRes?.brands || [];

  return (
    <div className="p-6 mx-auto space-y-6">
      <SparePartsSearch
        initialParts={parts as any}
        brands={brands as any}
        initialSearch={search}
        initialBrand={brand}
        meta={meta as any}
      />
    </div>
  );
}
